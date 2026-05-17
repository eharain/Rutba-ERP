'use strict';

const context = require('./context');
const recordings = require('./recordings');
const interfaces = require('./interfaces');
const policyResolver = require('./policy-resolver');
const permissionEngine = require('./permission-engine');
const requestInterceptor = require('./request-interceptor');
const mePermissions = require('./me-permissions');
const users = require('./users');
const scaffoldRunner = require('./scaffold-runner');
const fileStore = require('./file-store');
const sync = require('./sync');
const policies = require('./policies');
const scaffold = require('./scaffold');
const seeder = require('./seeder');
const play = require('./play');
const templates = require('./templates');

module.exports = {
  context,
  recordings,
  interfaces,
  policyResolver,
  permissionEngine,
  requestInterceptor,
  mePermissions,
  users,
  scaffoldRunner,
  fileStore,
  sync,
  policies,
  scaffold,
  seeder,
  play,
  templates,
};
