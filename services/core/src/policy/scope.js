'use strict';

/**
 * Scope templates: the per-(policy, role-level) filter/body fragments api-pro's
 * request interceptor injects into a request before it reaches a controller.
 *
 * Vocabulary (matches `packages/api-provider/api/<resource>.js` conventions):
 *
 *   INTERFACE — the descriptor file (e.g. cash-registers.js).
 *   POLICY    — each method exported on it (list, byId, create, open, close).
 *               Methods ARE policies.
 *   SCOPE     — the per-role-level block that becomes the four
 *               {filters,populate,body,query}Template columns.
 *
 * Authoring shape:
 *
 *   meta: {
 *     uid: '...',
 *     domains: [...],
 *     roles: ['admin', 'manager', 'staff'],
 *     // Interface-level scope, applied to every policy in this file.
 *     scope: {
 *       admin:   {},                    // unrestricted
 *       manager: {},                    // unrestricted
 *       staff: {
 *         scope: 'owner+recency',       // shorthand
 *         ownerField: 'opened_by',      // optional (default 'createdBy')
 *         recencyField: 'opened_at',    // optional (default 'createdAt')
 *         recencyToken: '$last7days',   // optional (default)
 *         // Or, for finer control, literal templates instead of `scope`:
 *         filters: { ... }, body: { ... }, populate: { ... }, query: { ... },
 *       },
 *     },
 *   },
 *
 *   list: ({...} = {}) => ({
 *     path: '...',
 *     action: 'find',
 *     scope: { staff: { scope: 'recency' } },   // per-policy override
 *   }),
 *
 * Shorthand values:
 *   'none'          — no filter (the default when a level is absent)
 *   'owner'         — ownership filter on find/findOne/update/delete; on create
 *                     the body is stamped with the owner instead.
 *   'owner+recency' — `owner` PLUS a recency filter, on `find` only.
 *                     findOne/update/delete stay ownership-only — a single-row
 *                     lookup already targets a specific id.
 *   'recency'       — recency filter only, on `find`.
 *
 * Admin and manager default to unrestricted; staff is unrestricted too unless
 * a scope.staff block opts the interface into scoping.
 *
 * Ported verbatim from the Strapi plugin's seeder — these fragments are
 * enforcement, so a behaviour change here silently widens or narrows what a
 * role can read.
 */

const DEFAULT_RECENCY_TOKEN = '$last7days';

function emptyTemplates() {
  return { filtersTemplate: {}, populateTemplate: {}, bodyTemplate: {}, queryTemplate: {} };
}

function expandScopeShorthand(scope, action, ownerField, recencyField, recencyToken) {
  const a = String(action || '').toLowerCase();
  const ownerFilter = { [ownerField]: { id: { $eq: '$user.id' } } };
  const recencyFilter = { [recencyField]: { $gte: recencyToken } };

  if (scope === 'owner') {
    if (a === 'create') return { bodyTemplate: { [ownerField]: '$user.id' } };
    return { filtersTemplate: ownerFilter };
  }

  if (scope === 'owner+recency') {
    if (a === 'create') return { bodyTemplate: { [ownerField]: '$user.id' } };
    if (a === 'find') return { filtersTemplate: { $and: [ownerFilter, recencyFilter] } };
    return { filtersTemplate: ownerFilter };
  }

  if (scope === 'recency') {
    if (a === 'find') return { filtersTemplate: recencyFilter };
    return {};
  }

  return {};
}

/** Build the four template fields from one per-level block. */
function buildTemplatesFromLevelBlock(levelBlock, action) {
  if (!levelBlock || typeof levelBlock !== 'object') return emptyTemplates();

  const ownerField = levelBlock.ownerField || 'createdBy';
  const recencyField = levelBlock.recencyField || 'createdAt';
  const recencyToken = levelBlock.recencyToken || DEFAULT_RECENCY_TOKEN;

  // 1) start from the shorthand (if any)
  const combined = expandScopeShorthand(levelBlock.scope, action, ownerField, recencyField, recencyToken);

  // 2) layer literal templates on top — these win over the shorthand
  if (levelBlock.filters) combined.filtersTemplate = { ...(combined.filtersTemplate || {}), ...levelBlock.filters };
  if (levelBlock.populate) combined.populateTemplate = { ...(combined.populateTemplate || {}), ...levelBlock.populate };
  if (levelBlock.body) combined.bodyTemplate = { ...(combined.bodyTemplate || {}), ...levelBlock.body };
  if (levelBlock.query) combined.queryTemplate = { ...(combined.queryTemplate || {}), ...levelBlock.query };

  return {
    filtersTemplate: combined.filtersTemplate || {},
    populateTemplate: combined.populateTemplate || {},
    bodyTemplate: combined.bodyTemplate || {},
    queryTemplate: combined.queryTemplate || {},
  };
}

/** Policy-level scope wins over interface-level when both define the same role. */
function effectiveLevelBlock(interfaceScope, policyScope, level) {
  const key = String(level || '').toLowerCase();
  const policyBlock = policyScope && typeof policyScope === 'object' ? policyScope[key] : undefined;
  if (policyBlock !== undefined) return policyBlock;
  if (interfaceScope && typeof interfaceScope === 'object') return interfaceScope[key];
  return undefined;
}

function templatesForRole(interfaceScope, policyScope, level, action) {
  return buildTemplatesFromLevelBlock(effectiveLevelBlock(interfaceScope, policyScope, level), action);
}

module.exports = {
  templatesForRole,
  buildTemplatesFromLevelBlock,
  effectiveLevelBlock,
  expandScopeShorthand,
  emptyTemplates,
  DEFAULT_RECENCY_TOKEN,
};
