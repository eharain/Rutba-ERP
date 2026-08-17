'use strict';

/**
 * Loads content-type and component schemas from their existing homes:
 *   - pos-strapi/src/api/<api>/content-types/<ct>/schema.json   (app CTs)
 *   - pos-strapi/src/components/<category>/<name>.json          (components)
 *   - packages/strapi-api-pro/server/src/content-types/<ct>/schema.json
 *
 * The schema.json files remain the single source of truth shared with
 * pos-strapi for the whole strangler migration (program ground rule 3).
 *
 * Built-in plugin models (users-permissions, upload, admin) are declared
 * here with just enough shape to resolve relation targets and tables.
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('../config/env');

function readJson(file) {
  // Some schema files carry a UTF-8 BOM — strip before parsing.
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

function loadApiContentTypes() {
  const apiRoot = path.join(REPO_ROOT, 'pos-strapi', 'src', 'api');
  const out = [];
  for (const apiName of fs.readdirSync(apiRoot)) {
    const ctRoot = path.join(apiRoot, apiName, 'content-types');
    if (!fs.existsSync(ctRoot) || !fs.statSync(ctRoot).isDirectory()) continue;
    for (const ctName of fs.readdirSync(ctRoot)) {
      const schemaFile = path.join(ctRoot, ctName, 'schema.json');
      if (!fs.existsSync(schemaFile)) continue;
      const schema = readJson(schemaFile);
      out.push({
        uid: `api::${apiName}.${schema.info.singularName}`,
        source: 'api',
        schema,
      });
    }
  }
  return out;
}

function loadPluginContentTypes() {
  const out = [];
  const apiProRoot = path.join(
    REPO_ROOT, 'packages', 'strapi-api-pro', 'server', 'src', 'content-types'
  );
  if (fs.existsSync(apiProRoot)) {
    for (const ctName of fs.readdirSync(apiProRoot)) {
      const schemaFile = path.join(apiProRoot, ctName, 'schema.json');
      if (!fs.existsSync(schemaFile)) continue;
      const schema = readJson(schemaFile);
      out.push({
        uid: `plugin::api-pro.${schema.info.singularName}`,
        source: 'plugin:api-pro',
        schema,
      });
    }
  }
  return out;
}

function loadComponents() {
  const compRoot = path.join(REPO_ROOT, 'pos-strapi', 'src', 'components');
  const out = [];
  if (!fs.existsSync(compRoot)) return out;
  for (const category of fs.readdirSync(compRoot)) {
    const catDir = path.join(compRoot, category);
    if (!fs.statSync(catDir).isDirectory()) continue;
    for (const file of fs.readdirSync(catDir)) {
      if (!file.endsWith('.json')) continue;
      const schema = readJson(path.join(catDir, file));
      // Components have no info.singularName; their model name (the filename)
      // is what Strapi uses to derive link-table columns (bom-line → bom_line_id).
      const name = path.basename(file, '.json');
      out.push({
        uid: `${category}.${name}`,
        source: 'component',
        modelName: name,
        schema,
      });
    }
  }
  return out;
}

/**
 * Built-in plugin models rutba-core must know about to resolve relations.
 * Tables owned by Strapi core/plugins that we read but do not derive.
 */
const BUILTIN_MODELS = {
  'plugin::users-permissions.user': { tableName: 'up_users', singularName: 'user' },
  'plugin::users-permissions.role': { tableName: 'up_roles', singularName: 'role' },
  'plugin::users-permissions.permission': { tableName: 'up_permissions', singularName: 'permission' },
  'plugin::upload.file': { tableName: 'files', singularName: 'file' },
  'plugin::upload.folder': { tableName: 'upload_folders', singularName: 'folder' },
  'admin::user': { tableName: 'admin_users', singularName: 'user' },
  'admin::role': { tableName: 'admin_roles', singularName: 'role' },
  'admin::permission': { tableName: 'admin_permissions', singularName: 'permission' },
};

// Sensitive UP columns that must never be readable through the shim.
const UP_PRIVATE_ATTRS = new Set([
  'password', 'resetPasswordToken', 'confirmationToken',
]);

/**
 * The users-permissions user extension schema (adds app_roles etc.). Loaded as
 * a PARTIAL model: attrs the extension declares, minus secrets — enough for
 * claims resolution and safe populate. Live table has extra base columns the
 * model doesn't declare (validator skips extras for partial models).
 */
function loadUpExtensionUser() {
  const file = path.join(
    REPO_ROOT, 'pos-strapi', 'src', 'extensions', 'users-permissions',
    'content-types', 'user', 'schema.json'
  );
  if (!fs.existsSync(file)) return [];
  const schema = readJson(file);
  schema.attributes = Object.fromEntries(
    Object.entries(schema.attributes || {}).filter(([a]) => !UP_PRIVATE_ATTRS.has(a))
  );
  // api-pro injects this relation onto the UP user at plugin register() time
  // (see packages/strapi-api-pro/server/src/content-types/app-role/index.js) —
  // it is not in any schema.json, so mirror the injection here.
  schema.attributes.app_roles = {
    type: 'relation',
    relation: 'manyToMany',
    target: 'plugin::api-pro.app-role',
    inversedBy: 'users',
  };
  return [{
    uid: 'plugin::users-permissions.user',
    source: 'up-extension',
    partial: true,
    schema,
  }];
}

/**
 * The upload plugin's own file/folder schemas, as PARTIAL models.
 *
 * BUILTIN_MODELS declares these tables so relations can resolve, but with no
 * attributes — which left two things broken once core started writing media:
 * documents() returned a file with only its base fields, and
 * db.query('plugin::upload.file').update({ data: { folder } }) — what
 * media-library's moveFiles does — rejected `folder` as neither scalar nor
 * relation. Loading the real schemas fixes both.
 *
 * `related` is dropped: it is a morphToMany with no target, which the registry
 * cannot model, and nothing reads it through the shim — the media populate path
 * queries files_related_mph directly.
 */
function loadUploadPluginModels() {
  const base = path.join(
    REPO_ROOT, 'pos-strapi', 'node_modules', '@strapi', 'upload',
    'dist', 'server', 'content-types'
  );
  const out = [];
  for (const [uid, file] of [
    ['plugin::upload.file', 'file.js'],
    ['plugin::upload.folder', 'folder.js'],
  ]) {
    const full = path.join(base, file);
    if (!fs.existsSync(full)) continue;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { schema } = require(full);
    const attributes = Object.fromEntries(
      Object.entries(schema.attributes || {}).filter(([, def]) => def.type !== 'relation' || def.target)
    );
    out.push({ uid, source: 'upload-plugin', partial: true, schema: { ...schema, attributes } });
  }
  return out;
}

function loadAllSchemas() {
  return {
    contentTypes: [
      ...loadApiContentTypes(), ...loadPluginContentTypes(),
      ...loadUpExtensionUser(), ...loadUploadPluginModels(),
    ],
    components: loadComponents(),
    builtins: BUILTIN_MODELS,
  };
}

module.exports = { loadAllSchemas, BUILTIN_MODELS };
