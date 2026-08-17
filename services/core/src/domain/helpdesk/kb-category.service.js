'use strict';

/**
 * KbCategoryService — the knowledge base's shelving (spec 11 §11.3).
 *
 * A category is configuration, not content: it decides where an article sits in
 * the tree and, through `visibility`, which tree it appears in at all. That
 * second job is why this is a service rather than CRUD — a category's
 * visibility is read by policy/kb-visibility.js when it decides whether an
 * account-holding customer may open an `internal` article (§29.7's ⚙️), so a
 * careless edit here changes who can read something over there.
 *
 * MAX DEPTH 3, MATERIALISED (§11.3). `depth` is a column rather than a walk on
 * every read: the limit is then one comparison at write time, a tree render can
 * order by it without re-deriving it, and — the part that matters — a cycle
 * cannot be created, because a category's depth is always its parent's plus
 * one and a parent that is its own descendant has no finite depth to be given.
 * Root categories are depth 0, so the legal range is 0..2.
 *
 * REPARENTING MOVES THE SUBTREE. Changing a category's parent changes the depth
 * of everything beneath it, and a subtree that would breach the limit is
 * refused as a whole rather than half-moved. The walk is bounded by the depth
 * limit itself, so it cannot run away.
 *
 * DEACTIVATION, NEVER DELETION. A deleted category orphans its articles and its
 * children silently; `is_active = false` takes it out of every tree while
 * leaving the articles addressable by slug, which is the behaviour a published
 * URL requires. The same reasoning as desks (§32.4): configuration changes must
 * not strand work.
 *
 * Rows leave here in the repository's mapped shape plus a `children` array on
 * the tree reads, so a caller can render without a second pass.
 */

const { withTransaction } = require('../../db/connection');
const { emit } = require('../../platform/events');
const kbRepo = require('./repository/kb.repo');
const kb = require('./policy/kb-visibility');

const MAX_DEPTH = 3;
const KEY_RE = /^[a-z][a-z0-9_]*$/;

const CATEGORY_UID = 'api::helpdesk-kb-category.helpdesk-kb-category';

/** Editable through create/update. Everything else is derived or immutable. */
const WRITABLE = Object.freeze([
  'key', 'name', 'description', 'icon', 'parent_id', 'sequence', 'visibility', 'is_active',
]);

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    if (details) this.details = details;
  }
}

class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; }
}

function eventActorOf(actor) {
  const { eventActor } = require('./policy/entitlement');
  return eventActor(actor);
}

// ── reads ─────────────────────────────────────────────────────────────────

/**
 * The categories this actor may see. Staff and machine actors see the whole
 * tree including the `internal`-only branches; a requester sees only the
 * branches the tenant put on their surface.
 *
 * Note what this does NOT do: it never hides a category because the actor
 * cannot read the ARTICLES in it. Article visibility is decided per article by
 * kb-visibility, and a category that renders empty is a correct answer — the
 * alternative (counting readable articles per category on every tree read) is a
 * per-row query the tree endpoint cannot afford and would still be a guess by
 * the time the reader clicked.
 */
function visibilitiesFor(actor) {
  if (kb.isStaff(actor) || kb.isMachine(actor)) return null;
  if (kb.isEmployee(actor)) return null;
  return ['public', 'both'];
}

async function list(actor, options = {}) {
  const activeOnly = options.includeInactive ? false : true;
  if (options.includeInactive && !kb.can(actor, 'kb.author')) {
    throw new kb.ForbiddenError('Not permitted: helpdesk.kb.author');
  }
  return kbRepo.listCategories({
    activeOnly,
    visibilities: visibilitiesFor(actor),
  });
}

/**
 * The same set, nested. Built from the flat list in one pass rather than by
 * querying per level: the tree is at most three deep and single digits wide,
 * and a recursive query would be three round trips to answer what one already
 * did.
 *
 * A category whose parent is not in the visible set becomes a root in the
 * rendered tree rather than disappearing with its subtree — losing a whole
 * branch because its parent was marked `internal` would hide public articles
 * from the public help pages.
 */
async function tree(actor, options = {}) {
  const rows = await list(actor, options);
  const byId = new Map(rows.map((row) => [row.id, { ...row, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function get(actor, idOrKey) {
  const category = await kbRepo.findCategory(idOrKey);
  if (!category) throw new NotFoundError('Not Found');
  const allowed = visibilitiesFor(actor);
  // 404 rather than 403 — a category the reader may not see is absent, for the
  // same enumeration reason articles are (spec 27.8).
  if (allowed && !allowed.includes(category.visibility)) throw new NotFoundError('Not Found');
  if (allowed && !category.is_active) throw new NotFoundError('Not Found');
  return category;
}

async function requireCategory(idOrKey) {
  const category = await kbRepo.findCategory(idOrKey);
  if (!category) throw new NotFoundError(`No such KB category: ${idOrKey}`);
  return category;
}

// ── validation ────────────────────────────────────────────────────────────

function normalizeInput(patch, current) {
  const out = {};
  for (const column of WRITABLE) {
    if (!(column in patch)) continue;
    out[column] = patch[column];
  }

  if ('key' in out) {
    const key = String(out.key || '').trim().toLowerCase();
    if (!KEY_RE.test(key)) {
      throw new ValidationError(`Category key "${out.key}" must be lower snake case and start with a letter`);
    }
    if (current && current.key !== key) {
      // The key reaches article imports, seeded configuration and any link the
      // CMS built against it; changing it silently unpicks all of them.
      throw new ValidationError('A category key is immutable once created — create a new category instead');
    }
    out.key = key;
  }
  if ('name' in out) {
    out.name = String(out.name || '').trim();
    if (!out.name) throw new ValidationError('Category name is required');
  }
  if ('visibility' in out && !kb.CATEGORY_VISIBILITIES.includes(out.visibility)) {
    throw new ValidationError(
      `visibility must be one of ${kb.CATEGORY_VISIBILITIES.join(', ')}`,
      { visibility: out.visibility }
    );
  }
  if ('sequence' in out) {
    const n = Number(out.sequence);
    if (!Number.isInteger(n) || n < 0) throw new ValidationError('sequence must be a non-negative integer');
    out.sequence = n;
  }
  if ('parent_id' in out) {
    out.parent_id = out.parent_id === null || out.parent_id === undefined || out.parent_id === ''
      ? null
      : Number(out.parent_id);
    if (out.parent_id !== null && !Number.isFinite(out.parent_id)) {
      throw new ValidationError('parent_id must be a category id or null');
    }
  }
  if ('is_active' in out) out.is_active = Boolean(out.is_active);
  return out;
}

/**
 * The parent's depth plus one, refused past the limit. There are no foreign
 * keys on any helpdesk table (see migration 011), so the parent's existence is
 * checked here or it is not checked at all.
 */
async function depthFor(parentId) {
  if (!parentId) return 0;
  const parent = await kbRepo.findCategoryById(parentId);
  if (!parent) throw new ValidationError(`Parent category #${parentId} does not exist`);
  const depth = parent.depth + 1;
  if (depth >= MAX_DEPTH) {
    throw new ValidationError(
      `A KB category tree is at most ${MAX_DEPTH} levels deep (§11.3) — "${parent.name}" is already `
      + `at level ${parent.depth + 1}`
    );
  }
  return depth;
}

/**
 * Every descendant of a category, deepest last. Bounded by MAX_DEPTH passes
 * rather than by a visited set: a cycle cannot exist, because depthFor() refuses
 * to give a category a depth greater than its parent's, and the walk therefore
 * terminates on the tree's own shape.
 */
async function descendants(categoryId) {
  const all = await kbRepo.listCategories({ activeOnly: false });
  const out = [];
  let frontier = [categoryId];
  for (let level = 0; level < MAX_DEPTH && frontier.length; level++) {
    const next = all.filter((row) => frontier.includes(row.parent_id));
    out.push(...next);
    frontier = next.map((row) => row.id);
  }
  return out;
}

// ── writes ────────────────────────────────────────────────────────────────

async function create(actor, input = {}) {
  kb.assertCan(actor, 'kb.configure');

  const patch = normalizeInput(input, null);
  if (!patch.key) throw new ValidationError('Category key is required');
  if (!patch.name) throw new ValidationError('Category name is required');

  const clash = await kbRepo.findCategory(patch.key);
  if (clash) throw new ValidationError(`Category key "${patch.key}" is already taken`);

  const depth = await depthFor(patch.parent_id || null);

  return withTransaction(async () => {
    const category = await kbRepo.insertCategory({ ...patch, depth });
    await emit({
      eventName: 'helpdesk.kb.category.created',
      entityUid: CATEGORY_UID,
      documentId: category.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActorOf(actor),
      payload: { categoryId: category.id, key: category.key, name: category.name, visibility: category.visibility },
    });
    return category;
  });
}

/**
 * Every configuration change is audited with before/after (§32.12). Until the
 * Core audit service exists, the `helpdesk.kb.category.updated` event carries
 * the changed fields and IS that record — written in the same transaction as
 * the change, which is the property that makes it usable as one.
 */
async function update(actor, idOrKey, input = {}) {
  kb.assertCan(actor, 'kb.configure');
  const current = await requireCategory(idOrKey);

  const patch = normalizeInput(input, current);
  const changes = {};
  for (const [column, value] of Object.entries(patch)) {
    const before = current[column] === undefined ? null : current[column];
    if (JSON.stringify(before) !== JSON.stringify(value === undefined ? null : value)) {
      changes[column] = { from: before, to: value };
    }
  }
  if (!Object.keys(changes).length) return current;

  const write = { ...patch };
  let moved = [];

  if ('parent_id' in changes) {
    if (patch.parent_id === current.id) throw new ValidationError('A category cannot be its own parent');
    const subtree = await descendants(current.id);
    if (subtree.some((row) => row.id === patch.parent_id)) {
      throw new ValidationError('A category cannot be moved beneath one of its own descendants');
    }
    const depth = await depthFor(patch.parent_id);
    // The whole subtree moves with it, so the limit is checked against the
    // DEEPEST descendant rather than against this row alone. A move that would
    // push a grandchild past the limit is refused before anything is written.
    const shift = depth - current.depth;
    const deepest = subtree.reduce((max, row) => Math.max(max, row.depth), current.depth);
    if (deepest + shift >= MAX_DEPTH) {
      throw new ValidationError(
        `Moving "${current.name}" there would push its subtree past ${MAX_DEPTH} levels (§11.3)`
      );
    }
    write.depth = depth;
    moved = subtree.map((row) => ({ id: row.id, depth: row.depth + shift }));
  }

  return withTransaction(async () => {
    const updated = await kbRepo.updateCategory(current.id, write);
    for (const row of moved) await kbRepo.updateCategory(row.id, { depth: row.depth });
    await emit({
      eventName: 'helpdesk.kb.category.updated',
      entityUid: CATEGORY_UID,
      documentId: current.documentId,
      tenantId: kbRepo.tenantId(),
      actor: eventActorOf(actor),
      payload: { categoryId: current.id, key: current.key, changes, movedDescendants: moved.length },
    });
    return updated;
  });
}

async function deactivate(actor, idOrKey) {
  return update(actor, idOrKey, { is_active: false });
}

async function activate(actor, idOrKey) {
  return update(actor, idOrKey, { is_active: true });
}

module.exports = {
  MAX_DEPTH,
  CATEGORY_UID,
  list,
  tree,
  get,
  requireCategory,
  create,
  update,
  deactivate,
  activate,
  descendants,
  ValidationError,
  NotFoundError,
};
