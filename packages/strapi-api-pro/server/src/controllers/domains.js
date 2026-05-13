'use strict';

// Admin CRUD over plugin::api-pro.app-domain. Domains are operational records
// (no file-backed authoring layer for them) â€” straight DB operations.
//
// Also exposes related-roles CRUD for app-roles within the context of a domain
// since the Admin UI's "Roles & Domains" page edits them together.

const DOMAIN_UID = 'plugin::api-pro.app-domain';
const ROLE_UID = 'plugin::api-pro.app-role';

function pickDomainInput(body) {
  const data = body?.data || body || {};
  return {
    key: typeof data.key === 'string' ? data.key.toLowerCase().trim() : undefined,
    name: typeof data.name === 'string' ? data.name.trim() : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    isActive: typeof data.isActive === 'boolean' ? data.isActive : undefined,
  };
}

function pickRoleInput(body) {
  const data = body?.data || body || {};
  return {
    key: typeof data.key === 'string' ? data.key.toLowerCase().trim() : undefined,
    name: typeof data.name === 'string' ? data.name.trim() : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    isActive: typeof data.isActive === 'boolean' ? data.isActive : undefined,
    adminRoleCode: typeof data.adminRoleCode === 'string' ? data.adminRoleCode : undefined,
    appDomains: Array.isArray(data.appDomains) ? data.appDomains.map(Number).filter(Boolean) : undefined,
  };
}

function sendError(ctx, status, message, code) {
  ctx.status = status;
  ctx.body = { error: { code: code || 'API_PRO_ERROR', message } };
}

module.exports = {
  // â”€â”€ Domains â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listDomains(ctx) {
    const data = await strapi.db.query(DOMAIN_UID).findMany({
      populate: { appRoles: true },
      orderBy: { key: 'asc' },
    });
    ctx.body = { data };
  },

  async createDomain(ctx) {
    const input = pickDomainInput(ctx.request.body);
    if (!input.key || !input.name) {
      return sendError(ctx, 400, 'key and name are required', 'VALIDATION_FAILED');
    }
    try {
      const data = await strapi.db.query(DOMAIN_UID).create({ data: input });
      strapi.apiPro?.clearAllCache?.();
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, 400, error?.message || 'Failed to create domain');
    }
  },

  async updateDomain(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError(ctx, 400, 'id is required', 'VALIDATION_FAILED');
    const input = pickDomainInput(ctx.request.body);
    const data = await strapi.db.query(DOMAIN_UID).update({
      where: { id },
      data: input,
    });
    if (!data) return sendError(ctx, 404, `domain ${id} not found`, 'NOT_FOUND');
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  },

  async deleteDomain(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError(ctx, 400, 'id is required', 'VALIDATION_FAILED');
    const data = await strapi.db.query(DOMAIN_UID).delete({ where: { id } });
    if (!data) return sendError(ctx, 404, `domain ${id} not found`, 'NOT_FOUND');
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  },

  // â”€â”€ Roles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async listRoles(ctx) {
    const data = await strapi.db.query(ROLE_UID).findMany({
      populate: { appDomains: true },
      orderBy: { key: 'asc' },
    });
    ctx.body = { data };
  },

  async createRole(ctx) {
    const input = pickRoleInput(ctx.request.body);
    if (!input.key || !input.name) {
      return sendError(ctx, 400, 'key and name are required', 'VALIDATION_FAILED');
    }
    const payload = {
      ...input,
      adminRoleCode: input.adminRoleCode || input.key,
      appDomains: input.appDomains || [],
    };
    try {
      const data = await strapi.db.query(ROLE_UID).create({ data: payload });
      strapi.apiPro?.clearAllCache?.();
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, 400, error?.message || 'Failed to create role');
    }
  },

  async updateRole(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError(ctx, 400, 'id is required', 'VALIDATION_FAILED');
    const input = pickRoleInput(ctx.request.body);
    const data = await strapi.db.query(ROLE_UID).update({
      where: { id },
      data: input,
    });
    if (!data) return sendError(ctx, 404, `role ${id} not found`, 'NOT_FOUND');
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  },

  async deleteRole(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError(ctx, 400, 'id is required', 'VALIDATION_FAILED');
    const data = await strapi.db.query(ROLE_UID).delete({ where: { id } });
    if (!data) return sendError(ctx, 404, `role ${id} not found`, 'NOT_FOUND');
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  },
};
