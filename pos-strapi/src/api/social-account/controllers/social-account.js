'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppAdmin } = require('../../../utils/require-admin');

const POST_UID = 'api::social-post.social-post';

// Social accounts hold the platform API keys/secrets/tokens — managing them is
// an admin-only job. Reads (find/findOne) stay open so non-admins can still pick
// accounts when composing a post (secrets are `private` and never serialized).
const requireAdmin = (ctx, strapi) => requireAppAdmin(ctx, strapi, 'social');

// The OAuth/connection orchestration lives on the social-post service (it owns
// the provider adapters + token persistence). The account controller is a thin
// authd entry point, plus the public OAuth redirect target.
function svc(strapi) {
  return strapi.service(POST_UID);
}

// Tiny HTML page the popup shows; it notifies the opener and closes itself.
function popupHtml({ ok, message }) {
  const payload = JSON.stringify({ source: 'rutba-social-oauth', ok, message });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Connecting…</title></head>
<body style="font-family:system-ui;padding:2rem;text-align:center">
<p>${ok ? '✅ Connected. You can close this window.' : '❌ ' + (message || 'Connection failed')}</p>
<script>
  try { if (window.opener) window.opener.postMessage(${payload}, '*'); } catch (e) {}
  setTimeout(function(){ window.close(); }, ok ? 600 : 4000);
</script>
</body></html>`;
}

module.exports = createCoreController('api::social-account.social-account', ({ strapi }) => ({
  // ── credential CRUD: admin-only writes (keys live here) ────────────────────
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

  /** Build the provider OAuth consent URL for this account. */
  async getConnectUrl(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    try {
      const result = await svc(strapi).buildConnectUrl(ctx.params.id);
      return ctx.send(result);
    } catch (e) {
      return ctx.badRequest(e.message || 'Could not build connect URL');
    }
  },

  /** Public OAuth redirect target. Exchanges the code and stores tokens. */
  async oauthCallback(ctx) {
    const { state, code, error, error_description } = ctx.query;
    ctx.type = 'html';
    try {
      const result = await svc(strapi).handleOAuthCallback({ state, code, error, error_description });
      ctx.body = popupHtml({ ok: true, message: `${result.platform} · ${result.account_name || ''}` });
    } catch (e) {
      strapi.log.warn(`[social] oauth callback failed: ${e.message}`);
      ctx.body = popupHtml({ ok: false, message: e.message });
    }
  },

  /** Probe whether the stored token is usable (refreshing if needed). */
  async validateConnection(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    try {
      const result = await svc(strapi).validateConnection(ctx.params.id);
      return ctx.send(result);
    } catch (e) {
      return ctx.badRequest(e.message || 'Validation failed');
    }
  },

  /** Force a token refresh. */
  async syncToken(ctx) {
    if (!await requireAdmin(ctx, strapi)) return;
    try {
      const result = await svc(strapi).refreshAccountToken(ctx.params.id);
      return ctx.send(result);
    } catch (e) {
      return ctx.badRequest(e.message || 'Refresh failed');
    }
  },
}));
