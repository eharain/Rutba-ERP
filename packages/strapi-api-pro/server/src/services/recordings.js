'use strict';

const SESSION_UID = 'plugin::api-pro.recording-session';
const ENTRY_UID = 'plugin::api-pro.recording-entry';

async function getActiveSession(strapi) {
  return await strapi.db.query(SESSION_UID).findOne({
    where: { status: 'recording' },
    orderBy: { createdAt: 'desc' },
  });
}

// Normalise the filters payload into a safe shape. The recorder middleware
// (when it lands) will use these to decide whether to capture a request.
//   methods         — HTTP verbs to capture (uppercase). Empty → all.
//   pathPatterns    — substring patterns matched against ctx.path. Empty → all.
//   contentTypeUids — Strapi content-type UIDs (api::*.*) to capture. Empty → all.
function normalizeFilters(raw) {
  const out = { methods: [], pathPatterns: [], contentTypeUids: [] };
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.methods)) {
    out.methods = raw.methods
      .map((m) => String(m || '').trim().toUpperCase())
      .filter(Boolean);
  }
  if (Array.isArray(raw.pathPatterns)) {
    out.pathPatterns = raw.pathPatterns
      .map((p) => String(p || '').trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw.contentTypeUids)) {
    out.contentTypeUids = raw.contentTypeUids
      .map((u) => String(u || '').trim())
      .filter(Boolean);
  }
  return out;
}

async function startSession(strapi, context, payload = {}) {
  const active = await getActiveSession(strapi);
  if (active) return active;

  const now = new Date();
  const appName = context?.claim?.appName || 'unknown-app';
  const roleKey = context?.claim?.roleKey || 'unknown-role';

  return await strapi.db.query(SESSION_UID).create({
    data: {
      name: payload.name || `${appName}:${roleKey}:${now.toISOString()}`,
      status: 'recording',
      startedAt: now,
      startedByUserId: context?.user?.id || null,
      resolvedAppName: appName,
      resolvedRoleKey: roleKey,
      filters: normalizeFilters(payload.filters),
    },
  });
}

async function stopSession(strapi) {
  const active = await getActiveSession(strapi);
  if (!active) return null;

  return await strapi.db.query(SESSION_UID).update({
    where: { id: active.id },
    data: {
      status: 'stopped',
      stoppedAt: new Date(),
    },
  });
}

async function listSessions(strapi) {
  return await strapi.db.query(SESSION_UID).findMany({
    orderBy: { createdAt: 'desc' },
  });
}

async function listEntries(strapi, sessionId) {
  return await strapi.db.query(ENTRY_UID).findMany({
    where: { session: sessionId },
    orderBy: { updatedAt: 'desc' },
  });
}

module.exports = {
  startSession,
  stopSession,
  listSessions,
  listEntries,
  getActiveSession,
  normalizeFilters,
};
