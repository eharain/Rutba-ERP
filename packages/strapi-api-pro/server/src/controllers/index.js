'use strict';

const health = require('./health');
const recordings = require('./recordings');
const interfaces = require('./interfaces');
const users = require('./users');
const me = require('./me');
const domains = require('./domains');
const policies = require('./policies');
const adminTools = require('./admin-tools');

module.exports = {
  health,
  recordings,
  interfaces,
  users,
  me,
  domains,
  policies,
  'admin-tools': adminTools,
};
