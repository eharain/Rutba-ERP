'use strict';

// Ensures the `rutba_app_user` users-permissions role can hit every content-type
// referenced by an @rutba/api-provider descriptor. Idempotent — only inserts
// missing rows.
//
// This is a STOPGAP. The architectural goal is for api-pro to be the sole
// gatekeeper and UP to be bypassed (see memory: feedback_api_pro_no_role_level_grant
// and docs/pre-deployment-findings-2026-05-15.md). Until api-pro enforcement is
// fixed, the existing partial UP grants mean some endpoints work and others
// 403 — this seed brings the set uniform so the frontends can load.
//
// Scope:
//   role:   plugin::users-permissions.role where type = 'rutba_app_user'
//   actions per uid: find, findOne, create, update, delete
//   uids:   meta.uid declared by every api-provider/api/*.js descriptor
//           that resolves to a real api::* content-type

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROLE_TYPE = 'rutba_app_user';
const STANDARD_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'];

// Custom (non-CRUD) controller actions referenced by api-provider descriptors.
// UP route permissions are per-action, so each custom route handler needs its
// own grant here. The controller stays responsible for any finer-grained
// authorization (e.g. crm-lead.assignees checks the caller holds a CRM
// app-role itself, because a UP grant alone admits every app user).
const CUSTOM_ACTIONS = {
  'api::crm-lead.crm-lead': ['assignees'],
  'api::hr-leave-request.hr-leave-request': ['myRequests', 'teamQueue', 'approve', 'reject', 'cancel'],
  'api::hr-team.hr-team': ['appRoleOptions'],
  'api::pay-statutory-remittance.pay-statutory-remittance': ['process'],
  'api::acc-journal-entry.acc-journal-entry': ['trialBalance', 'incomeStatement', 'balanceSheet', 'cashFlow', 'arAging', 'apAging'],
  'api::purchase.purchase': ['generateBill'],
  'api::pay-payroll-run.pay-payroll-run': ['preview', 'process', 'cancel'],
  'api::pay-payslip.pay-payslip': ['myPayslips', 'markPaid'],
};

function resolveApiProviderRoot(strapi) {
  const cwd = strapi?.dirs?.app?.root || process.cwd();
  try {
    const domainsPath = require.resolve('@rutba/api-provider/config/domains', { paths: [cwd] });
    return path.dirname(path.dirname(domainsPath));
  } catch (e) {
    strapi?.log?.warn(`[up-perm-seed] @rutba/api-provider not resolvable from ${cwd}: ${e?.message}`);
    return null;
  }
}

async function collectDescriptorUids(strapi, root) {
  const apiDir = path.join(root, 'api');
  if (!fs.existsSync(apiDir)) return [];

  const files = fs
    .readdirSync(apiDir)
    .filter((n) => n.endsWith('.js') && n !== 'index.js' && !n.startsWith('_'))
    .sort();

  const uids = new Set();
  for (const fileName of files) {
    const fullPath = path.join(apiDir, fileName);
    let mod;
    try {
      mod = await import(pathToFileURL(fullPath).href);
    } catch (e) {
      strapi.log.warn(`[up-perm-seed] failed to import ${fileName}: ${e?.message}`);
      continue;
    }
    for (const exported of Object.values(mod)) {
      const uid = exported?.meta?.uid;
      if (typeof uid !== 'string' || !uid.startsWith('api::')) continue;
      if (!strapi.contentTypes?.[uid]) continue;
      uids.add(uid);
    }
  }
  return [...uids];
}

async function ensureUpPermissions(strapi) {
  const role = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: ROLE_TYPE }, select: ['id'] });

  if (!role) {
    strapi.log.info(`[up-perm-seed] users-permissions role '${ROLE_TYPE}' not found — skipping`);
    return { ok: true, skipped: true, granted: 0 };
  }

  const root = resolveApiProviderRoot(strapi);
  if (!root) return { ok: false, error: '@rutba/api-provider not resolvable' };

  const uids = await collectDescriptorUids(strapi, root);
  if (uids.length === 0) {
    strapi.log.info('[up-perm-seed] no descriptor uids resolved — skipping');
    return { ok: true, skipped: true, granted: 0 };
  }

  const existing = await strapi.db.query('plugin::users-permissions.permission').findMany({
    where: { role: { id: role.id } },
    select: ['id', 'action'],
  });
  const have = new Set(existing.map((p) => p.action));

  let granted = 0;
  for (const uid of uids) {
    const actions = [...STANDARD_ACTIONS, ...(CUSTOM_ACTIONS[uid] || [])];
    for (const action of actions) {
      const actionUid = `${uid}.${action}`;
      if (have.has(actionUid)) continue;
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: { action: actionUid, role: role.id },
      });
      granted += 1;
    }
  }

  if (granted > 0) {
    strapi.log.info(
      `[up-perm-seed] role='${ROLE_TYPE}' granted ${granted} permissions across ${uids.length} content-types`
    );
  } else {
    strapi.log.info(`[up-perm-seed] role='${ROLE_TYPE}' already covers ${uids.length} content-types`);
  }

  return { ok: true, skipped: false, granted, uidCount: uids.length };
}

module.exports = ensureUpPermissions;
