'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');
const { ensureUser } = require('../../../utils/ensure-user');
const relays = require('../../../social-relays');

const UID = 'api::social-relay-provider.social-relay-provider';

// Relay providers hold aggregator API keys — managing them is admin-only, same
// as social-accounts. Reads stay open so staff can pick a relay when pushing a
// post (api_key/extra_config are `private` and never serialized).
//
// `admin` rides alongside `social` because registering a relay moved to the
// rutba-admin console. Which APP may reach the write methods is a separate
// decision, made by `apps: ['admin']` on the descriptor; this list only says
// which ROLE-key prefixes count as an administrator, so an instance admin
// holding admin_admin qualifies without also holding social_admin.
const requireAdmin = (ctx, strapi) => requireAppRole(ctx, strapi, {
  domains: ['admin', 'social'],
  levels: ['admin'],
  message: 'An admin or social admin app role is required',
});

module.exports = createCoreController(UID, ({ strapi }) => ({
  async create(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    return super.create(ctx);
  },
  async update(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    return super.update(ctx);
  },
  async delete(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    return super.delete(ctx);
  },

  /**
   * Provider catalogue for the settings UI: which relay providers exist, the
   * platforms each can post to, whether api_url/target_id are needed, and the
   * setup help text. Sourced from the adapter registry so the frontend never
   * hardcodes a provider or platform list.
   */
  async meta(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    return ctx.send({ providers: relays.listRelayProviders() });
  },

  /** Probe the configured key against the provider (Test button + after save). */
  async validate(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    const relay = await strapi.documents(UID).findOne({ documentId: ctx.params.id });
    if (!relay) return ctx.notFound('Relay provider not found');
    try {
      const adapter = relays.getRelayAdapter(relay.provider);
      const result = await adapter.validate({ strapi, relay });
      await strapi.documents(UID).update({
        documentId: relay.documentId,
        data: result.ok
          ? { last_validated_at: new Date().toISOString(), last_error: null }
          : { last_error: result.detail || 'Validation failed' },
      });
      return ctx.send(result);
    } catch (e) {
      const message = e?.message || 'Validation failed';
      await strapi.documents(UID).update({
        documentId: relay.documentId, data: { last_error: message },
      });
      return ctx.send({ ok: false, detail: message });
    }
  },
}));
