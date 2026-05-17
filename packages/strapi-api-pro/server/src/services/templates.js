'use strict';

const TEMPLATE_UID = 'plugin::api-pro.app-role-template';

function slugify(input) {
  const s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) return `template-${Date.now()}`;
  return /^[a-z]/.test(s) ? s : `t-${s}`;
}

async function uniqueKey(strapi, base) {
  const root = slugify(base);
  let key = root;
  let i = 1;
  while (await strapi.db.query(TEMPLATE_UID).findOne({ where: { key } })) {
    i += 1;
    key = `${root}-${i}`;
  }
  return key;
}

function normalizeRoleIds(roleIds) {
  return (Array.isArray(roleIds) ? roleIds : [])
    .map(Number)
    .filter((v) => Number.isFinite(v) && v > 0);
}

async function listTemplates(strapi) {
  return await strapi.db.query(TEMPLATE_UID).findMany({
    orderBy: { name: 'asc' },
    select: ['id', 'key', 'name', 'description'],
    populate: { appRoles: { select: ['id', 'key', 'name'] } },
  });
}

async function createTemplate(strapi, { name, description, roleIds }) {
  if (!name || !String(name).trim()) {
    const err = new Error('Template name is required');
    err.status = 400;
    throw err;
  }
  const key = await uniqueKey(strapi, name);
  const created = await strapi.db.query(TEMPLATE_UID).create({
    data: {
      key,
      name: String(name).trim(),
      description: description || null,
      appRoles: normalizeRoleIds(roleIds),
    },
  });
  return await strapi.db.query(TEMPLATE_UID).findOne({
    where: { id: created.id },
    select: ['id', 'key', 'name', 'description'],
    populate: { appRoles: { select: ['id', 'key', 'name'] } },
  });
}

async function updateTemplate(strapi, id, { name, description, roleIds }) {
  const tid = Number(id);
  if (!Number.isFinite(tid) || tid <= 0) {
    const err = new Error('Invalid template id');
    err.status = 400;
    throw err;
  }
  const data = {};
  if (typeof name === 'string' && name.trim()) data.name = name.trim();
  if (typeof description === 'string') data.description = description;
  if (Array.isArray(roleIds)) data.appRoles = normalizeRoleIds(roleIds);

  await strapi.db.query(TEMPLATE_UID).update({ where: { id: tid }, data });
  return await strapi.db.query(TEMPLATE_UID).findOne({
    where: { id: tid },
    select: ['id', 'key', 'name', 'description'],
    populate: { appRoles: { select: ['id', 'key', 'name'] } },
  });
}

async function deleteTemplate(strapi, id) {
  const tid = Number(id);
  if (!Number.isFinite(tid) || tid <= 0) {
    const err = new Error('Invalid template id');
    err.status = 400;
    throw err;
  }
  await strapi.db.query(TEMPLATE_UID).delete({ where: { id: tid } });
  return { id: tid };
}

module.exports = {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
