'use strict';

/**
 * The condition language — one declarative expression tree, one evaluator.
 *
 * Routing rules (spec 14.7), automation rules (spec 13.2) and approval steps
 * (spec 23) all need "does this ticket match?". Written three times that becomes
 * three dialects, three sets of edge cases and three bugs; spec 14.7 says so
 * explicitly ("one expression language, one evaluator, one set of tests"), so
 * this file is that one implementation and the three engines are callers.
 *
 * CONDITIONS ARE DATA. There is no eval, no Function constructor, no template
 * interpolation and no property access that a rule author can steer into the
 * prototype chain — a rule is a JSON tree written by a tenant admin through the
 * configuration API, which makes it untrusted input to this process. The whole
 * grammar is:
 *
 *   group   { "all": [ ... ] } | { "any": [ ... ] } | { "not": <node> }
 *   leaf    { "field": "priority", "op": "in", "value": ["high", "urgent"] }
 *
 * THE STRICT/TOTAL SPLIT is the design decision that matters here.
 *   validate() is strict: it throws on anything malformed, and is meant to run
 *   when a rule is SAVED, so a broken rule is rejected by the admin who wrote it.
 *   explain()/evaluate() are total: they never throw, whatever they are handed.
 * That is not defensive padding. Spec 14 requires that routing never fails a
 * ticket, and a rule saved before a validation gap was closed must not be able
 * to take the desk down at 3am. A leaf that cannot be evaluated records its
 * error in the trace and counts as false, which is visible in /routing/preview
 * instead of being visible in an incident.
 *
 * explain() DOES NOT SHORT-CIRCUIT, on purpose: `/routing/preview` and
 * automation dry-run exist to show why a rule did or did not match, and a trace
 * that stops at the first false branch answers half the question. evaluate() is
 * explain().result, so the explanation can never drift from the decision.
 *
 * ABSENT FIELDS answer false for every operator except the negative ones (`ne`,
 * `nin`), which answer true. The alternative — false for everything — makes
 * `{ field: 'x', op: 'eq' }` and `{ field: 'x', op: 'ne' }` both false when x is
 * absent, and a rule author who writes "priority is not urgent" as a catch-all
 * silently gets no matches on tickets that never set a priority.
 *
 * ARRAY-VALUED FIELDS (tags, requester_kinds) compare by membership: `eq`
 * against an array is "contains that element", `in` is set intersection. Tags
 * are the single most common thing a rule keys on, and requiring a separate
 * operator for them would mean every author gets it wrong once.
 *
 * The evaluator never reads a clock. Time-of-day conditions are served by the
 * caller putting the facts it already computed into the context (routing passes
 * `now`), which keeps this file deterministic and testable without freezing time.
 */

const OPERATORS = Object.freeze([
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'in', 'nin', 'contains', 'starts_with', 'exists', 'between',
]);

const OPERATOR_SET = new Set(OPERATORS);
const NEGATIVE_OPERATORS = new Set(['ne', 'nin']);
const GROUP_KEYS = Object.freeze(['all', 'any', 'not']);

// A rule tree is authored by hand; twenty levels is far past "complicated" and
// well short of anything that could exhaust the stack.
const MAX_DEPTH = 20;

// Reachable through a dotted path only if we let them be. A rule is tenant
// input, so the path walker refuses them rather than trusting hasOwnProperty
// alone.
const UNSAFE_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

const MISSING = Symbol('missing');

// Distinguishable from a plain string so a leaf can compare against a real
// ISO timestamp without Number() turning '2026-08-10' into NaN first.
const DATE_LIKE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}|$)/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ── value coercion ────────────────────────────────────────────────────────

function isDateLike(value) {
  return value instanceof Date || (typeof value === 'string' && DATE_LIKE_RE.test(value));
}

function toEpoch(value) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

/**
 * -1 / 0 / 1, or null when the two values are not comparable. Dates are tried
 * before numbers because MySQL hands datetimes back as strings and Number()
 * would quietly fail on every one of them.
 */
function compare(left, right) {
  if (isDateLike(left) && isDateLike(right)) {
    const a = toEpoch(left);
    const b = toEpoch(right);
    if (a === null || b === null) return null;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const a = toNumber(left);
  const b = toNumber(right);
  if (a !== null && b !== null) return a < b ? -1 : a > b ? 1 : 0;
  if (typeof left === 'string' && typeof right === 'string') {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return null;
}

/**
 * Equality across the type sloppiness of the sources a condition sees: a
 * tinyint(1) from MySQL, a string from a query parameter, a number from JSON
 * and a real boolean all have to agree.
 */
function looseEquals(left, right) {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return false;
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    const a = toBoolean(left);
    const b = toBoolean(right);
    return a !== null && a === b;
  }
  const cmp = compare(left, right);
  if (cmp !== null) return cmp === 0;
  return String(left) === String(right);
}

function matchesValue(actual, expected) {
  if (Array.isArray(actual)) return actual.some((item) => looseEquals(item, expected));
  return looseEquals(actual, expected);
}

function asText(value, caseSensitive) {
  const text = typeof value === 'string' ? value : String(value);
  return caseSensitive ? text : text.toLowerCase();
}

// ── field resolution ──────────────────────────────────────────────────────

/**
 * Walk a dotted path over the context. Own properties only, numeric segments
 * index arrays, and anything absent returns MISSING rather than undefined so a
 * field explicitly set to null stays distinguishable from a field that is not
 * there — `exists` is the only operator that can tell them apart, and it should
 * treat both as absent.
 */
function resolveField(context, path) {
  if (typeof path !== 'string' || path === '') return MISSING;
  let cursor = context;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) return MISSING;
    if (segment === '' || UNSAFE_SEGMENTS.has(segment)) return MISSING;
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) return MISSING;
      cursor = cursor[index];
      continue;
    }
    if (typeof cursor !== 'object') return MISSING;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return MISSING;
    cursor = cursor[segment];
  }
  return cursor === undefined ? MISSING : cursor;
}

// ── validation (strict; run this on save) ─────────────────────────────────

function isEmpty(node) {
  if (node === null || node === undefined) return true;
  if (Array.isArray(node)) return node.length === 0;
  if (typeof node === 'object') return Object.keys(node).length === 0;
  return false;
}

function validateLeaf(node, path) {
  if (typeof node.field !== 'string' || node.field.trim() === '') {
    throw new ValidationError(`${path}: "field" must be a non-empty path`);
  }
  for (const segment of node.field.split('.')) {
    if (segment === '') throw new ValidationError(`${path}: "${node.field}" has an empty path segment`);
    if (UNSAFE_SEGMENTS.has(segment)) throw new ValidationError(`${path}: "${segment}" is not addressable`);
  }
  if (!OPERATOR_SET.has(node.op)) {
    throw new ValidationError(
      `${path}: unknown operator "${node.op}" — expected one of ${OPERATORS.join(', ')}`
    );
  }
  if (node.op === 'in' || node.op === 'nin') {
    if (!Array.isArray(node.value)) throw new ValidationError(`${path}: "${node.op}" needs an array value`);
    return;
  }
  if (node.op === 'between') {
    if (!Array.isArray(node.value) || node.value.length !== 2) {
      throw new ValidationError(`${path}: "between" needs a [low, high] value`);
    }
    return;
  }
  if (node.op !== 'exists' && node.value === undefined) {
    throw new ValidationError(`${path}: "${node.op}" needs a value`);
  }
}

function validateNode(node, path, depth) {
  if (depth > MAX_DEPTH) throw new ValidationError(`${path}: nested deeper than ${MAX_DEPTH} levels`);
  if (isEmpty(node)) return;
  if (Array.isArray(node)) {
    node.forEach((child, index) => validateNode(child, `${path}[${index}]`, depth + 1));
    return;
  }
  if (typeof node !== 'object') {
    throw new ValidationError(`${path}: expected a condition object, got ${typeof node}`);
  }

  const groups = GROUP_KEYS.filter((key) => node[key] !== undefined);
  if (groups.length > 1) {
    throw new ValidationError(`${path}: "${groups.join('" and "')}" on one node — nest them instead`);
  }
  if (groups.length === 1) {
    const key = groups[0];
    if (node.field !== undefined || node.op !== undefined) {
      throw new ValidationError(`${path}: a "${key}" group cannot also be a comparison`);
    }
    if (key === 'not') {
      validateNode(node.not, `${path}.not`, depth + 1);
      return;
    }
    if (!Array.isArray(node[key])) throw new ValidationError(`${path}.${key}: expected an array of conditions`);
    node[key].forEach((child, index) => validateNode(child, `${path}.${key}[${index}]`, depth + 1));
    return;
  }

  validateLeaf(node, path);
}

/**
 * Throws ValidationError (→ 400) naming the exact path of the problem. Call it
 * from every save path that accepts a condition tree: a rule that cannot be
 * evaluated is worth rejecting in front of the person who wrote it, since by
 * the time it silently matches nothing, nobody is looking.
 */
function validate(node, path = 'conditions') {
  validateNode(node, path, 0);
  return true;
}

// ── evaluation (total; never throws) ──────────────────────────────────────

function explainLeaf(node, context) {
  const trace = { type: 'condition', field: node.field, op: node.op, value: node.value, actual: null, result: false };

  if (!OPERATOR_SET.has(node.op)) {
    trace.error = `unknown operator "${node.op}"`;
    return trace;
  }

  const raw = resolveField(context, node.field);
  const present = raw !== MISSING && raw !== null;
  trace.actual = present ? raw : null;

  if (node.op === 'exists') {
    const want = node.value === undefined ? true : toBoolean(node.value) !== false;
    trace.result = present === want;
    return trace;
  }
  if (!present) {
    trace.result = NEGATIVE_OPERATORS.has(node.op);
    return trace;
  }

  const caseSensitive = node.case_sensitive === true;

  switch (node.op) {
    case 'eq':
      trace.result = matchesValue(raw, node.value);
      break;
    case 'ne':
      trace.result = !matchesValue(raw, node.value);
      break;
    case 'in':
    case 'nin': {
      if (!Array.isArray(node.value)) {
        trace.error = `"${node.op}" needs an array value`;
        break;
      }
      const hit = node.value.some((candidate) => matchesValue(raw, candidate));
      trace.result = node.op === 'in' ? hit : !hit;
      break;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const cmp = compare(raw, node.value);
      if (cmp === null) {
        trace.error = 'values are not comparable';
        break;
      }
      if (node.op === 'gt') trace.result = cmp > 0;
      else if (node.op === 'gte') trace.result = cmp >= 0;
      else if (node.op === 'lt') trace.result = cmp < 0;
      else trace.result = cmp <= 0;
      break;
    }
    case 'contains':
      trace.result = Array.isArray(raw)
        ? raw.some((item) => looseEquals(item, node.value))
        : asText(raw, caseSensitive).includes(asText(node.value, caseSensitive));
      break;
    case 'starts_with':
      trace.result = Array.isArray(raw)
        ? raw.some((item) => asText(item, caseSensitive).startsWith(asText(node.value, caseSensitive)))
        : asText(raw, caseSensitive).startsWith(asText(node.value, caseSensitive));
      break;
    case 'between': {
      if (!Array.isArray(node.value) || node.value.length !== 2) {
        trace.error = '"between" needs a [low, high] value';
        break;
      }
      const low = compare(raw, node.value[0]);
      const high = compare(raw, node.value[1]);
      if (low === null || high === null) {
        trace.error = 'values are not comparable';
        break;
      }
      trace.result = low >= 0 && high <= 0;
      break;
    }
    default:
      trace.error = `unhandled operator "${node.op}"`;
  }

  return trace;
}

function explainGroup(kind, children, context, depth) {
  const evaluated = children.map((child) => explainNode(child, context, depth + 1));
  // An author who leaves a group empty means "no restriction here", in both
  // flavours. `any: []` resolving to false would silently disable the rule.
  const result = evaluated.length === 0
    ? true
    : (kind === 'any' ? evaluated.some((c) => c.result) : evaluated.every((c) => c.result));
  return { type: kind, result, children: evaluated };
}

function explainNode(node, context, depth) {
  if (depth > MAX_DEPTH) {
    return { type: 'error', result: false, error: `nested deeper than ${MAX_DEPTH} levels` };
  }
  if (isEmpty(node)) return { type: 'always', result: true };
  if (Array.isArray(node)) return explainGroup('all', node, context, depth);
  if (typeof node !== 'object') {
    return { type: 'error', result: false, error: `expected a condition object, got ${typeof node}` };
  }

  const groups = GROUP_KEYS.filter((key) => node[key] !== undefined);
  if (groups.length > 1) {
    return { type: 'error', result: false, error: `"${groups.join('" and "')}" on one node` };
  }
  if (groups.length === 1) {
    const key = groups[0];
    if (key === 'not') {
      const inner = explainNode(node.not, context, depth + 1);
      return { type: 'not', result: !inner.result, children: [inner] };
    }
    if (!Array.isArray(node[key])) {
      return { type: 'error', result: false, error: `"${key}" expects an array of conditions` };
    }
    return explainGroup(key, node[key], context, depth);
  }

  return explainLeaf(node, context);
}

/**
 * The decision plus the reasoning behind it, as a tree mirroring the rule.
 * Every node carries `result`; leaves also carry the value that was actually
 * found, which is what turns "the rule did not match" into "the rule did not
 * match because priority was normal".
 */
function explain(node, context = {}) {
  return explainNode(node, context, 0);
}

/** The decision alone. Always agrees with explain(), because it is explain(). */
function evaluate(node, context = {}) {
  return explain(node, context).result;
}

module.exports = {
  evaluate,
  explain,
  validate,
  resolveField,
  isEmpty,
  OPERATORS,
  MISSING,
};
