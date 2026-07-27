'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const knex = require('knex');
const { dbConfig } = require('../config/env');

let instance = null;
const trxStorage = new AsyncLocalStorage();

/**
 * Returns the active transaction when called inside withTransaction(), the
 * base pool otherwise — so every shim query is transaction-aware without
 * threading trx through call signatures (mirrors Strapi's behavior).
 */
function getDb() {
  const trx = trxStorage.getStore();
  if (trx) return trx;
  if (!instance) instance = knex(dbConfig());
  return instance;
}

/**
 * Caller-scoped transaction (the `strapi.db.transaction` equivalent).
 * Nested calls join the ambient transaction instead of opening a new one.
 */
async function withTransaction(cb) {
  const existing = trxStorage.getStore();
  if (existing) return cb(existing);
  if (!instance) instance = knex(dbConfig());
  return instance.transaction((trx) => trxStorage.run(trx, () => cb(trx)));
}

async function closeDb() {
  if (instance) {
    await instance.destroy();
    instance = null;
  }
}

module.exports = { getDb, withTransaction, closeDb };
