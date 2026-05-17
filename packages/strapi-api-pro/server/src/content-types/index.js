'use strict';

const appDomain = require('./app-domain');
const appRole = require('./app-role');
const appRoleTemplate = require('./app-role-template');
const recordingSession = require('./recording-session');
const recordingEntry = require('./recording-entry');
const apiInterface = require('./api-interface');
const apiInterfaceMethod = require('./api-interface-method');
const apiMethodPolicy = require('./api-method-policy');

module.exports = {
  'app-domain': appDomain,
  'app-role': appRole,
  'app-role-template': appRoleTemplate,
  'recording-session': recordingSession,
  'recording-entry': recordingEntry,
  'api-interface': apiInterface,
  'api-interface-method': apiInterfaceMethod,
  'api-method-policy': apiMethodPolicy,
};
