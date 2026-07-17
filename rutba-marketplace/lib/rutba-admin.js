'use strict';

// Provision a Strapi API token on a peer Rutba (online) instance from ADMIN
// credentials — so the operator doesn't have to create one by hand in the remote
// admin panel. Mirrors the strapi-content-sync-pro setup flow:
//   1. POST /admin/login            → admin JWT
//   2. GET  /admin/api-tokens       → find + delete a previous auto-token
//   3. POST /admin/api-tokens       → mint a fresh full-access token
// Returns the accessKey. The password is used only for this exchange and is
// never stored — only the resulting token is persisted (as the account api_key).

const TOKEN_NAME = 'rutba-marketplace-sync';

// The admin API (/admin/*) lives at the Strapi ROOT, not under the /api base the
// marketplace account stores. Derive the root from the API base.
function adminRootFrom(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status || 502;
  return e;
}

async function jsonFetch(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    const code = err && (err.cause?.code || err.code);
    const hint = code === 'ECONNREFUSED' ? 'connection refused — is the remote running?'
      : code === 'ENOTFOUND' ? 'host not found — check the URL'
        : code === 'ETIMEDOUT' ? 'timed out — check firewall/network'
          : 'network error';
    throw httpError(502, `Cannot reach ${url}: ${hint}${code ? ` (${code})` : ''}`);
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { res, data };
}

/**
 * @param {{ baseUrl: string, email: string, password: string }} args
 * @returns {Promise<{ token: string, adminRoot: string }>}
 */
async function provisionApiToken({ baseUrl, email, password }) {
  const adminRoot = adminRootFrom(baseUrl);
  if (!adminRoot) throw httpError(400, 'A valid online instance base URL is required');
  if (!email || !password) throw httpError(400, 'Admin email and password are required');

  // 1. Login to the remote admin.
  const login = await jsonFetch(`${adminRoot}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.res.ok) {
    if (login.res.status === 404) {
      throw httpError(404, `${adminRoot}/admin/login not found (404). Use the online instance's ROOT or /api URL, not an admin sub-path.`);
    }
    const remoteMsg = login.data && login.data.error && login.data.error.message;
    throw httpError(login.res.status, remoteMsg ? `Remote login failed: ${remoteMsg}` : `Login failed (HTTP ${login.res.status}) at ${adminRoot}/admin/login`);
  }
  const adminJwt = login.data && login.data.data && login.data.data.token;
  if (!adminJwt) throw httpError(500, 'No admin token returned by the remote instance');

  const authHeaders = { Authorization: `Bearer ${adminJwt}` };

  // 2. Delete a previous auto-token of the same name so the fresh accessKey is
  //    the one in effect (Strapi returns accessKey only at creation time).
  const list = await jsonFetch(`${adminRoot}/admin/api-tokens`, { method: 'GET', headers: authHeaders });
  if (list.res.ok && list.data && Array.isArray(list.data.data)) {
    const prior = list.data.data.find((t) => t && t.name === TOKEN_NAME);
    if (prior && prior.id != null) {
      await jsonFetch(`${adminRoot}/admin/api-tokens/${prior.id}`, { method: 'DELETE', headers: authHeaders });
    }
  }

  // 3. Mint a fresh full-access, non-expiring token.
  const created = await jsonFetch(`${adminRoot}/admin/api-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      name: TOKEN_NAME,
      description: 'Auto-generated token for the Rutba marketplace catalog/order sync',
      type: 'full-access',
      lifespan: null,
    }),
  });
  if (!created.res.ok) {
    const msg = (created.data && created.data.error && created.data.error.message) || 'Failed to create API token';
    throw httpError(created.res.status, msg);
  }
  const token = created.data && created.data.data && created.data.data.accessKey;
  if (!token) throw httpError(500, 'Remote did not return the new token accessKey');

  return { token, adminRoot };
}

module.exports = { provisionApiToken, adminRootFrom, TOKEN_NAME };
