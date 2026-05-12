'use strict';

const SESSION_UID = 'plugin::api-pro.recording-session';
const ENTRY_UID = 'plugin::api-pro.recording-entry';

async function getActiveSession(strapi) {
  return await strapi.db.query(SESSION_UID).findOne({
    where: { status: 'recording' },
    orderBy: { createdAt: 'desc' },
  });
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
};
