'use strict';

// Gate for the app's privileged API routes. Those routes run the engine with
// the Strapi *service token* (full access), so they must verify the caller is a
// real marketplace operator first. The browser sends the operator's user JWT
// (from pos-shared AuthContext) as a Bearer token; we (1) validate the session
// via /users/me and (2) confirm a marketplace app-role via the service token
// (DB-backed — the X-Rutba-App-Role header is never trusted here).

const config = require('./config');

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1] : null;
}

async function requireOperator(req, res) {
  const jwt = bearer(req);
  if (!jwt) {
    res.status(401).json({ error: 'Missing bearer token' });
    return null;
  }

  let me;
  try {
    const r = await fetch(`${config.strapi.apiUrl}/users/me`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return null;
    }
    me = await r.json();
  } catch (e) {
    res.status(502).json({ error: 'Auth check failed' });
    return null;
  }
  if (!me?.id) {
    res.status(401).json({ error: 'Invalid session' });
    return null;
  }

  // DB-backed role check via the service token (reliable relation populate).
  let full = null;
  try {
    const headers = config.strapi.token ? { Authorization: `Bearer ${config.strapi.token}` } : {};
    const r = await fetch(
      `${config.strapi.apiUrl}/users/${me.id}?populate[role][fields][0]=type&populate[app_roles][fields][0]=key`,
      { headers },
    );
    if (r.ok) full = await r.json();
  } catch (e) {
    /* fall through → fail closed below */
  }

  const isAdmin = full?.role?.type === 'admin';
  const isOperator = Array.isArray(full?.app_roles)
    && full.app_roles.some((ar) => /^marketplace_/.test(String(ar?.key || '')));

  if (!isAdmin && !isOperator) {
    res.status(403).json({ error: 'A marketplace app-role is required' });
    return null;
  }
  return me;
}

module.exports = { requireOperator, bearer };
