'use strict';

/**
 * crm-contact controller.
 *
 * Adds the contact-unification dual-write (Phase 1C.1): every contact created
 * or updated through the API resolves to a canonical `api::person.person` row
 * and links it. The inline `name`/`email`/`phone` fields stay for now — they
 * get dropped in Phase 2 once every reader has cut over.
 *
 * This link is what lets the saved-segment engine express a CRM audience as
 * person identities rather than CRM-local rows.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { resolvePerson } = require('../../../utils/person-link');

const UID = 'api::crm-contact.crm-contact';

// Link the contact to a person, best-effort. A dedup ambiguity (audited) or a
// contact with no email and no phone simply leaves `person` null — the row is
// still a perfectly valid CRM contact, it just isn't in any person-based
// segment until someone resolves the audit or fills in an identifier.
async function linkPerson(strapi, row) {
  if (!row?.documentId) return;
  const { person } = await resolvePerson(
    strapi,
    { name: row.name, email: row.email, phone: row.phone },
    { sourceUid: UID, sourceDocumentId: row.documentId },
  );
  if (!person) return;
  await strapi.documents(UID).update({
    documentId: row.documentId,
    data: { person: person.id },
  });
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  async create(ctx) {
    const response = await super.create(ctx);
    try {
      await linkPerson(strapi, response?.data);
    } catch (err) {
      strapi.log.warn(`[crm-contact] person dual-write failed on create: ${err.message}`);
    }
    return response;
  },

  async update(ctx) {
    const body = ctx.request?.body?.data ?? {};
    const touchedIdentity = 'email' in body || 'phone' in body;

    const response = await super.update(ctx);
    const row = response?.data;
    if (!row?.documentId) return response;

    try {
      const current = await strapi.documents(UID).findOne({
        documentId: row.documentId,
        populate: { person: { fields: ['id'] } },
      });
      if (!current?.person) {
        await linkPerson(strapi, row);
      } else if (touchedIdentity) {
        // An identifier change never re-points an already-linked contact at a
        // different person — that would be a merge, and merges are human
        // decisions (Phase 3.1 merge UI). Leave a breadcrumb instead.
        strapi.log.info(
          `[crm-contact] ${row.documentId} changed email/phone while linked to person ${current.person.id}; link left as-is`,
        );
      }
    } catch (err) {
      strapi.log.warn(`[crm-contact] person dual-write failed on update: ${err.message}`);
    }
    return response;
  },

}));
