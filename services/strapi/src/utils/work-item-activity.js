'use strict';

/**
 * Append one entry to the generic work-item audit trail
 * (api::work-item-activity.work-item-activity).
 *
 * Best-effort: never throws — callers (state-machine chokepoints, comment /
 * watch controllers) must not have a transition or write unwound because the
 * audit insert failed. Pass the actor (a users-permissions user) when known;
 * for system/internal transitions it can be omitted.
 *
 * @param {object} strapi
 * @param {object} a
 * @param {string} a.entityUid     e.g. 'api::mfg-work-order.mfg-work-order'
 * @param {string} a.documentId    the work item's documentId
 * @param {string} a.kind          created|transition|assigned|unassigned|watch|unwatch|comment|note
 * @param {string} [a.summary]
 * @param {string} [a.from]
 * @param {string} [a.to]
 * @param {object} [a.actor]       users-permissions user
 * @param {object} [a.data]
 */
async function logActivity(strapi, { entityUid, documentId, kind = 'note', summary, from, to, actor, data } = {}) {
  if (!entityUid || !documentId) return null;
  try {
    return await strapi.documents('api::work-item-activity.work-item-activity').create({
      data: {
        entity_uid: entityUid,
        target_document_id: documentId,
        kind,
        summary: summary || null,
        from_value: from != null ? String(from) : null,
        to_value: to != null ? String(to) : null,
        actor_label: actor ? (actor.username || actor.email || null) : null,
        ...(actor?.documentId ? { actor: actor.documentId } : {}),
        ...(data ? { data } : {}),
      },
    });
  } catch (err) {
    try { strapi.log.warn(`[work-item-activity] log failed for ${entityUid}/${documentId}: ${err.message}`); } catch (_) { /* no-op */ }
    return null;
  }
}

module.exports = { logActivity };
