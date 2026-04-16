#!/usr/bin/env node
'use strict';

/**
 * pos-strapi/server.js — Start Strapi programmatically via `node server.js`
 *
 * This allows Hostinger (or any Node-based process manager) to launch Strapi
 * with a plain `node` command instead of relying on the `strapi` CLI binary.
 */

const strapi = require('@strapi/strapi');

const app = strapi.createStrapi();
app.start();
