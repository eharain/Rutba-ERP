'use strict';

// The audience resolver — the one contract the whole campaign pipeline hangs
// on (rutba-campaigns spec §2): resolve(audience) → { members: [{ email,
// mergeData }], total }. When the crm-segment engine lands (ROADMAP 0.6), the
// 'segment' source resolves through this same signature and nothing else moves.

const { createCoreService } = require('@strapi/strapi').factories;

const UID = 'api::cmp-audience.cmp-audience';

const ENTITY_UIDS = {
  'crm-contact': 'api::crm-contact.crm-contact',
  customer: 'api::customer.customer',
  person: 'api::person.person',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const err = (message, status, code) => {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
};

module.exports = createCoreService(UID, ({ strapi }) => ({

  /**
   * Resolve to deduped, validated members. Also refreshes the advisory
   * member_count/last_resolved_at cache on the audience row.
   */
  async resolve(audienceOrDocId, { limit = 50_000 } = {}) {
    const audience = typeof audienceOrDocId === 'string'
      ? await strapi.documents(UID).findOne({ documentId: audienceOrDocId })
      : audienceOrDocId;
    if (!audience) throw err('Audience not found.', 404, 'audience_not_found');

    let rawMembers = [];

    if (audience.source === 'static') {
      rawMembers = (Array.isArray(audience.static_members) ? audience.static_members : [])
        .map((m) => ({
          email: String(m?.email || '').trim(),
          mergeData: (m && typeof m.mergeData === 'object' && m.mergeData)
            || Object.fromEntries(Object.entries(m || {}).filter(([k]) => k !== 'email')),
        }));
    } else if (audience.source === 'filter') {
      const uid = ENTITY_UIDS[audience.entity];
      if (!uid) throw err(`Audience entity '${audience.entity}' is not resolvable.`, 400, 'audience_bad_entity');
      const mapping = (audience.merge_mapping && typeof audience.merge_mapping === 'object')
        ? audience.merge_mapping
        : {};
      const pageSize = 1_000;
      for (let start = 0; start < limit; start += pageSize) {
        const rows = await strapi.documents(uid).findMany({
          filters: audience.filter_json && typeof audience.filter_json === 'object' ? audience.filter_json : {},
          start,
          limit: pageSize,
        });
        for (const row of rows) {
          const mergeData = { name: row.name || '', email: row.email || '' };
          for (const [key, field] of Object.entries(mapping)) {
            if (typeof field === 'string' && field) mergeData[key] = row[field] ?? '';
          }
          rawMembers.push({ email: String(row.email || '').trim(), mergeData });
        }
        if (rows.length < pageSize) break;
      }
    } else {
      throw err(
        "Audience source 'segment' is not built yet (ROADMAP 0.6) — use 'static' or 'filter'.",
        400,
        'audience_source_unbuilt',
      );
    }

    // Dedupe by address (case-insensitive), drop unusable emails.
    const seen = new Set();
    const members = [];
    for (const m of rawMembers) {
      const key = m.email.toLowerCase();
      if (!EMAIL_RE.test(m.email) || seen.has(key)) continue;
      seen.add(key);
      members.push(m);
    }

    await strapi.db.query(UID).update({
      where: { documentId: audience.documentId },
      data: { member_count: members.length, last_resolved_at: new Date() },
    });

    return { members, total: members.length };
  },
}));
