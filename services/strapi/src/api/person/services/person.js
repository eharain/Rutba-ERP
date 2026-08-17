'use strict';

const { factories } = require('@strapi/strapi');

const UID = 'api::person.person';

module.exports = factories.createCoreService(UID, ({ strapi }) => ({

  /**
   * Find-or-create the person row for the given UP user. Idempotent.
   *
   * Order of resolution:
   *   1. Person already linked to this user.id → return it.
   *   2. Orphan provisional person with matching email → claim it
   *      (set `user` FK, clear `provisional_at`). This is the
   *      anonymous-shopper-then-signs-up path; without it every
   *      guest-then-signup user becomes two identities.
   *   3. Create a fresh person and link.
   *
   * Email match for promotion is case-insensitive. We only promote when the
   * provisional has no `user` FK and the email exactly matches — phone
   * matches are deliberately NOT used here (shared family phones would
   * silently link strangers). Phone overlap is a job for the dedup audit
   * pile in Phase 3.
   */
  async ensureForUser(user) {
    if (!user?.id) return null;

    const linked = await strapi.documents(UID).findFirst({
      filters: { user: { id: { $eq: user.id } } },
    });
    if (linked) return linked;

    const email = (user.email || '').trim().toLowerCase();
    if (email) {
      const orphan = await strapi.documents(UID).findFirst({
        filters: {
          email: { $eqi: email },
          user: { id: { $null: true } },
          provisional_at: { $notNull: true },
        },
      });
      if (orphan) {
        const promoted = await strapi.documents(UID).update({
          documentId: orphan.documentId,
          data: {
            user: { id: user.id },
            provisional_at: null,
            // Backfill name from the UP user if the provisional row didn't
            // capture one (rare — checkout snapshot usually has it).
            ...(orphan.name ? {} : { name: user.username || user.email || `User ${user.id}` }),
          },
        });
        strapi.log.info(`[person] promoted provisional ${orphan.documentId} → user ${user.id}`);
        return promoted;
      }
    }

    // Race-safe create: oneToOne(user) enforces a unique constraint, so two
    // concurrent calls (e.g. storefront checkout + UP register hook firing
    // in parallel) would both reach this point with `linked == null` and
    // one would DB-error. On conflict, re-fetch and return the row the
    // other call just inserted — caller sees the same end state either way.
    try {
      return await strapi.documents(UID).create({
        data: {
          name: user.username || user.email || `User ${user.id}`,
          email: user.email,
          user: { id: user.id },
        },
      });
    } catch (err) {
      const winner = await strapi.documents(UID).findFirst({
        filters: { user: { id: { $eq: user.id } } },
      });
      if (winner) return winner;
      throw err;
    }
  },

  /**
   * Create a provisional person row for an anonymous checkout. The row is
   * tagged with `provisional_at` so the dedup job can later look for a
   * matching authenticated person (by email or phone) and merge.
   */
  async createProvisional({ name, email, phone }) {
    return strapi.documents(UID).create({
      data: {
        name: (name || '').trim() || 'Guest',
        email: (email || '').trim() || undefined,
        phone: (phone || '').trim() || undefined,
        provisional_at: new Date(),
      },
    });
  },
}));
