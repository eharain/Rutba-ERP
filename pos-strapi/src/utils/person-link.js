'use strict';

/**
 * Contact-unification link helper (docs/todo/contact-entity-unification.md,
 * Phase 1B/1C recipe) — resolves an inline contact shape to the canonical
 * `api::person.person` row, or parks the ambiguous case in the dedup audit
 * pile for a human.
 *
 * Shared by every "role row" that carries inline contact fields. CRM is the
 * first caller (crm-contact, Phase 1C.1) because the saved-segment engine has
 * to resolve audiences to person identity — a segment that returned CRM-local
 * rows would be a second, parallel contact entity, which is exactly what
 * unification exists to prevent.
 *
 * DEVIATION from the plan doc, deliberate: the doc says a single candidate
 * auto-links only when BOTH email and phone match. Taken literally that
 * audits every email-only contact (the common case) and the audit pile stops
 * being a signal. The rule implemented here is "every identifier the SOURCE
 * row actually carries must match" — a row with email+phone still needs both,
 * a row with email only needs the email. Anything weaker (name-only, partial)
 * still goes to the pile.
 */

const PERSON_UID = 'api::person.person';
const AUDIT_UID = 'api::person-dedup-audit.person-dedup-audit';

const normEmail = (v) => String(v ?? '').trim().toLowerCase() || null;
const normPhone = (v) => String(v ?? '').trim() || null;

/**
 * Record an ambiguous match for human review. Never throws — a failed audit
 * write must not take down the caller's create/update.
 *
 * Idempotent per (source row, match kind) while the audit is unresolved. Both
 * callers can fire repeatedly on the same row — the controller on every edit,
 * the backfill on every re-run — and a pile that grows a duplicate each time
 * is a pile nobody triages. A RESOLVED audit doesn't suppress a new one: if
 * the row goes ambiguous again after a human ruled on it, that's news.
 */
async function recordAudit(strapi, { sourceUid, sourceDocumentId, matchKind, candidates, proposedAction }) {
  try {
    const open = await strapi.documents(AUDIT_UID).findFirst({
      filters: {
        source_uid: { $eq: sourceUid },
        source_document_id: { $eq: String(sourceDocumentId) },
        match_kind: { $eq: matchKind },
        resolved_at: { $null: true },
      },
    });
    if (open) return;

    await strapi.documents(AUDIT_UID).create({
      data: {
        source_uid: sourceUid,
        source_document_id: String(sourceDocumentId),
        match_kind: matchKind,
        candidate_person_ids: (candidates || []).map((c) => c.id),
        proposed_action: proposedAction || 'skip',
      },
    });
  } catch (err) {
    strapi.log.warn(`[person-link] failed to write dedup audit for ${sourceUid}/${sourceDocumentId}: ${err.message}`);
  }
}

/**
 * Find (or create) the person for an inline contact shape.
 *
 * `dryRun` computes the same decision without writing anything — no person
 * created, no audit row, no backfilled field. Used by the backfill seeder to
 * produce a plan you can eyeball against a prod snapshot before committing.
 *
 * @returns {Promise<{ person: object|null, action: 'linked'|'created'|'audited'|'skipped', matchKind?: string }>}
 */
async function resolvePerson(strapi, { name, email, phone }, { sourceUid, sourceDocumentId, dryRun = false } = {}) {
  const e = normEmail(email);
  const p = normPhone(phone);

  // No identifier at all — a name is not enough to dedup on, and creating a
  // person per nameless row would flood the table with junk identities.
  if (!e && !p) return { person: null, action: 'skipped' };

  const candidates = await strapi.documents(PERSON_UID).findMany({
    filters: {
      $or: [
        ...(e ? [{ email: { $eqi: e } }] : []),
        ...(p ? [{ phone: { $eq: p } }] : []),
      ],
      merged_into: { id: { $null: true } },
    },
    populate: { user: { fields: ['id'] } },
    pagination: { limit: 10 },
  });

  if (candidates.length === 0) {
    if (dryRun) return { person: null, action: 'created' };
    const person = await strapi.documents(PERSON_UID).create({
      data: { name: String(name || '').trim() || e || p, email: e || undefined, phone: p || undefined },
    });
    return { person, action: 'created' };
  }

  if (candidates.length > 1) {
    // Two live persons already share this row's email/phone. Linking to either
    // one silently picks a winner; that decision belongs to a human.
    if (!dryRun) {
      await recordAudit(strapi, {
        sourceUid, sourceDocumentId, matchKind: 'multi_match', candidates, proposedAction: 'skip',
      });
    }
    return { person: null, action: 'audited', matchKind: 'multi_match' };
  }

  const [candidate] = candidates;
  const emailMatches = !e || normEmail(candidate.email) === e;
  const phoneMatches = !p || normPhone(candidate.phone) === p;

  if (!emailMatches || !phoneMatches) {
    if (!dryRun) {
      await recordAudit(strapi, {
        sourceUid, sourceDocumentId, matchKind: 'name_only', candidates, proposedAction: 'link',
      });
    }
    return { person: null, action: 'audited', matchKind: 'name_only' };
  }

  if (dryRun) return { person: candidate, action: 'linked' };

  // Backfill whichever identifier the person is missing — the role row is the
  // more recently touched source, so it's the better value for a null field.
  const fill = {};
  if (e && !candidate.email) fill.email = e;
  if (p && !candidate.phone) fill.phone = p;
  if (Object.keys(fill).length) {
    const updated = await strapi.documents(PERSON_UID).update({ documentId: candidate.documentId, data: fill });
    return { person: updated, action: 'linked' };
  }

  return { person: candidate, action: 'linked' };
}

module.exports = { resolvePerson, PERSON_UID };
