import React from 'react';
import { Box, Flex, Typography } from '@strapi/design-system';
import { tokens } from './tokens';

// FiltersBuilder — interactive editor for Strapi filter trees.
//
// Internal model is a tree of nodes:
//   Group node:     { id, type: 'group',     logic: '$and' | '$or', children: Node[] }
//   Condition node: { id, type: 'condition', path: 'field.path', operator: '$eq', value: 'foo' }
//
// Serializes to / from the Strapi filter shape:
//   { $and: [
//       { branch: { id: { $eq: '$user.branch.id' } } },
//       { $or: [
//           { status: { $eq: 'published' } },
//           { author: { id: { $eq: '$user.id' } } },
//         ]}
//     ]}
//
// Tokens like '$user.id' / '$today' / '$query.q' pass through unchanged — the
// server-side resolver evaluates them at request time.

const OPERATORS = [
  { value: '$eq', label: '= equals' },
  { value: '$ne', label: '≠ not equals' },
  { value: '$gt', label: '> greater than' },
  { value: '$gte', label: '≥ greater or equal' },
  { value: '$lt', label: '< less than' },
  { value: '$lte', label: '≤ less or equal' },
  { value: '$contains', label: '⊃ contains' },
  { value: '$notContains', label: '∌ not contains' },
  { value: '$startsWith', label: '↦ starts with' },
  { value: '$endsWith', label: '⤇ ends with' },
  { value: '$in', label: '∈ in (comma list)' },
  { value: '$notIn', label: '∉ not in (comma list)' },
  { value: '$null', label: '∅ is null' },
  { value: '$notNull', label: '∃ is not null' },
];

const NO_VALUE_OPS = new Set(['$null', '$notNull']);
const LIST_OPS = new Set(['$in', '$notIn']);
const MAX_DEPTH = 4;

let _idSeq = 0;
const nextId = () => `n${++_idSeq}`;

// ─── serialize tree → filter object ────────────────────────────────────────
function maybeNumber(v) {
  if (typeof v !== 'string') return v;
  if (v === '') return v;
  if (v.startsWith('$')) return v; // token — leave as string
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function buildLeaf(operator, rawValue) {
  if (NO_VALUE_OPS.has(operator)) return { [operator]: true };
  if (LIST_OPS.has(operator)) {
    const list = String(rawValue || '').split(',').map((s) => maybeNumber(s.trim())).filter((v) => v !== '');
    return { [operator]: list };
  }
  return { [operator]: maybeNumber(rawValue) };
}

function nestByPath(path, leaf) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (parts.length === 0) return null;
  return parts.reduceRight((acc, part) => ({ [part]: acc }), leaf);
}

export function buildFilterObject(node) {
  if (!node) return null;
  if (node.type === 'condition') {
    if (!node.path || !node.operator) return null;
    return nestByPath(node.path, buildLeaf(node.operator, node.value));
  }
  const children = (node.children || []).map(buildFilterObject).filter(Boolean);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { [node.logic]: children };
}

// ─── parse filter object → tree ────────────────────────────────────────────
const OP_KEYS = new Set(OPERATORS.map((o) => o.value));

function parseLeaf(obj) {
  // obj is something like { $eq: 5 } or { $in: [1, 2] }
  for (const key of OP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      let value = obj[key];
      if (LIST_OPS.has(key) && Array.isArray(value)) value = value.join(',');
      if (NO_VALUE_OPS.has(key)) value = '';
      if (value == null) value = '';
      return { operator: key, value: String(value) };
    }
  }
  return null;
}

// Walk `obj` collecting a flat list of path → leaf entries. The path
// represents nesting through plain fields (not operator keys).
function flattenConditions(obj, pathParts, out) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;

  // Detect if this object IS a leaf (contains an operator key directly).
  const leaf = parseLeaf(obj);
  if (leaf) {
    out.push({ path: pathParts.join('.'), ...leaf });
    return;
  }

  // Otherwise it's a nesting object — recurse on each key. Logical groups
  // ($and/$or) at this level are skipped here; caller handles them.
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$and' || k === '$or') continue;
    flattenConditions(v, [...pathParts, k], out);
  }
}

function parseTree(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { id: nextId(), type: 'group', logic: '$and', children: [] };
  }
  if (depth > MAX_DEPTH) {
    return { id: nextId(), type: 'group', logic: '$and', children: [] };
  }

  const keys = Object.keys(obj);

  // Top-level $or / $and group.
  if (keys.length === 1 && (keys[0] === '$or' || keys[0] === '$and')) {
    const logic = keys[0];
    const arr = Array.isArray(obj[logic]) ? obj[logic] : [];
    return {
      id: nextId(),
      type: 'group',
      logic,
      children: arr.map((c) => parseTree(c, depth + 1)),
    };
  }

  // Plain conditions tree — flatten paths into condition nodes.
  const out = [];
  flattenConditions(obj, [], out);
  const children = out.map((c) => ({
    id: nextId(),
    type: 'condition',
    path: c.path,
    operator: c.operator,
    value: c.value,
  }));
  return { id: nextId(), type: 'group', logic: '$and', children };
}

export function parseFilterObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return { id: nextId(), type: 'group', logic: '$and', children: [] };
  }
  return parseTree(obj, 0);
}

// ─── UI ────────────────────────────────────────────────────────────────────
const Pill = ({ active, color, children, onClick, title }) => (
  <button type="button" onClick={onClick} title={title} style={{
    border: `1px solid ${active ? color : tokens.neutral300}`,
    background: active ? `${color}1a` : '#fff',
    color: active ? color : tokens.neutral700,
    padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: tokens.monoFont,
  }}>
    {children}
  </button>
);

const ConditionRow = ({ node, depth, onChange, onRemove }) => {
  const noValue = NO_VALUE_OPS.has(node.operator);
  return (
    <Flex gap={1} alignItems="center" wrap="wrap" style={{
      padding: 6, marginBottom: 4,
      background: tokens.neutral100, borderRadius: tokens.radius,
      border: `1px solid ${tokens.neutral200}`,
    }}>
      <input
        type="text"
        value={node.path || ''}
        placeholder="field.path (e.g. branch.id)"
        onChange={(e) => onChange({ ...node, path: e.target.value })}
        style={{
          flex: '1 1 160px', minWidth: 120, padding: '4px 6px',
          border: `1px solid ${tokens.neutral300}`, borderRadius: tokens.radius,
          fontFamily: tokens.monoFont, fontSize: 12,
        }}
      />
      <select
        value={node.operator || '$eq'}
        onChange={(e) => onChange({ ...node, operator: e.target.value })}
        style={{
          padding: '4px 6px', border: `1px solid ${tokens.neutral300}`,
          borderRadius: tokens.radius, fontSize: 12, fontFamily: tokens.monoFont,
        }}
      >
        {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input
        type="text"
        value={node.value || ''}
        placeholder={noValue ? '(no value)' : 'value or $user.id'}
        disabled={noValue}
        onChange={(e) => onChange({ ...node, value: e.target.value })}
        style={{
          flex: '1 1 160px', minWidth: 120, padding: '4px 6px',
          border: `1px solid ${tokens.neutral300}`, borderRadius: tokens.radius,
          fontFamily: tokens.monoFont, fontSize: 12,
          background: noValue ? tokens.neutral200 : '#fff',
        }}
      />
      <button type="button" onClick={onRemove} title="Remove condition" style={{
        border: 'none', background: 'transparent', color: tokens.danger,
        cursor: 'pointer', fontSize: 16, padding: '0 6px',
      }}>×</button>
    </Flex>
  );
};

const GroupNode = ({ node, depth, onChange, onRemove, canRemove }) => {
  const isAnd = node.logic === '$and';
  const updateChild = (idx, next) => {
    const children = node.children.slice();
    if (next === null) children.splice(idx, 1);
    else children[idx] = next;
    onChange({ ...node, children });
  };
  const addCondition = () => onChange({
    ...node,
    children: [...node.children, { id: nextId(), type: 'condition', path: '', operator: '$eq', value: '' }],
  });
  const addGroup = () => {
    if (depth >= MAX_DEPTH) return;
    onChange({
      ...node,
      children: [...node.children, { id: nextId(), type: 'group', logic: '$and', children: [] }],
    });
  };

  return (
    <Box style={{
      padding: 8, marginBottom: 6,
      border: `1px solid ${isAnd ? tokens.primary : tokens.warning}`,
      borderLeft: `4px solid ${isAnd ? tokens.primary : tokens.warning}`,
      borderRadius: tokens.radiusLarge,
      background: depth === 0 ? '#fff' : `${tokens.neutral100}`,
    }}>
      <Flex justifyContent="space-between" alignItems="center" paddingBottom={2}>
        <Flex gap={1}>
          <Pill active={isAnd} color={tokens.primary}
            onClick={() => onChange({ ...node, logic: '$and' })}>AND</Pill>
          <Pill active={!isAnd} color={tokens.warning}
            onClick={() => onChange({ ...node, logic: '$or' })}>OR</Pill>
          <Typography variant="pi" textColor="neutral500">
            {node.children.length} {node.children.length === 1 ? 'item' : 'items'}
          </Typography>
        </Flex>
        {canRemove && (
          <button type="button" onClick={onRemove} title="Remove group" style={{
            border: 'none', background: 'transparent', color: tokens.danger,
            cursor: 'pointer', fontSize: 14, padding: '0 6px',
          }}>× group</button>
        )}
      </Flex>

      {node.children.map((child, idx) => (
        child.type === 'group'
          ? <GroupNode key={child.id} node={child} depth={depth + 1}
              onChange={(n) => updateChild(idx, n)}
              onRemove={() => updateChild(idx, null)}
              canRemove />
          : <ConditionRow key={child.id} node={child} depth={depth + 1}
              onChange={(n) => updateChild(idx, n)}
              onRemove={() => updateChild(idx, null)} />
      ))}

      <Flex gap={1} paddingTop={1}>
        <Pill color={tokens.primary} onClick={addCondition}>+ condition</Pill>
        {depth < MAX_DEPTH && (
          <Pill color={tokens.warning} onClick={addGroup}>+ group</Pill>
        )}
      </Flex>
    </Box>
  );
};

// Top-level component. Maintains the tree in internal state, derives the
// filter object on every change, and calls onChange with the serialized
// filter object so the parent can write it back to the policy.
export default function FiltersBuilder({ value, onChange }) {
  // Initialize state from incoming value once, then keep tree-state local.
  // We DO re-parse if the value changes externally (e.g. user reloads).
  const [tree, setTree] = React.useState(() => parseFilterObject(value));
  const lastValueRef = React.useRef(value);

  React.useEffect(() => {
    if (lastValueRef.current !== value) {
      lastValueRef.current = value;
      setTree(parseFilterObject(value));
    }
  }, [value]);

  const updateTree = (next) => {
    setTree(next);
    const obj = buildFilterObject(next) || {};
    lastValueRef.current = obj;
    onChange?.(obj);
  };

  return (
    <Box>
      <GroupNode node={tree} depth={0} onChange={updateTree} onRemove={() => {}} canRemove={false} />
      <Typography variant="pi" textColor="neutral500">
        Path uses dot notation (e.g. <code>branch.id</code>, <code>author.email</code>).
        Value can be a literal or a <code>$user.id</code> / <code>$today</code> / <code>$query.q</code> token.
      </Typography>
    </Box>
  );
}
