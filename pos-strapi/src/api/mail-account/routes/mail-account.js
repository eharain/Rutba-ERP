'use strict';

const { createCoreRouter } = require('@strapi/strapi').factories;

const defaultRouter = createCoreRouter('api::mail-account.mail-account');

// Custom routes first: koa-router must see the literal
// /mail-accounts/validate-connection before the core /:documentId routes.
// Folder names travel as query/body values, never path segments (IMAP paths
// carry delimiters and UTF-7 encoding).
const customRoutes = [
  {
    method: 'POST',
    path: '/mail-accounts/validate-connection',
    handler: 'api::mail-account.mail-account.validateConnection',
  },
  {
    method: 'GET',
    path: '/mail-accounts/assignees',
    handler: 'api::mail-account.mail-account.listAssignees',
  },
  {
    method: 'POST',
    path: '/mail-accounts/provision',
    handler: 'api::mail-account.mail-account.createProvision',
  },
  {
    method: 'GET',
    path: '/mail-accounts/access-map',
    handler: 'api::mail-account.mail-account.listAccess',
  },
  {
    // Registry-fed IMAP/SMTP defaults for the Connect Mailbox form.
    method: 'GET',
    path: '/mail-accounts/server-defaults',
    handler: 'api::mail-account.mail-account.getServerDefaults',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/access',
    handler: 'api::mail-account.mail-account.setAccess',
  },
  {
    method: 'GET',
    path: '/mail-accounts/:documentId/folders',
    handler: 'api::mail-account.mail-account.listFolders',
  },
  {
    // Literal /messages/* paths precede /messages/:uid — koa-router order.
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/bulk-flags',
    handler: 'api::mail-account.mail-account.setBulkFlags',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/bulk-remove',
    handler: 'api::mail-account.mail-account.removeBulkMessages',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/bulk-transfer',
    handler: 'api::mail-account.mail-account.transferBulkMessages',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/tags',
    handler: 'api::mail-account.mail-account.setTags',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/mailbox-password',
    handler: 'api::mail-account.mail-account.setMailboxPassword',
  },
  {
    method: 'GET',
    path: '/mail-accounts/:documentId/messages',
    handler: 'api::mail-account.mail-account.listMessages',
  },
  {
    method: 'GET',
    path: '/mail-accounts/:documentId/messages/:uid',
    handler: 'api::mail-account.mail-account.getMessage',
  },
  {
    method: 'GET',
    path: '/mail-accounts/:documentId/messages/:uid/attachment',
    handler: 'api::mail-account.mail-account.getAttachment',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/:uid/flags',
    handler: 'api::mail-account.mail-account.setFlags',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/:uid/remove',
    handler: 'api::mail-account.mail-account.removeMessage',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/send',
    handler: 'api::mail-account.mail-account.sendMessage',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/:uid/transfer',
    handler: 'api::mail-account.mail-account.transferMessage',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/drafts',
    handler: 'api::mail-account.mail-account.createDraft',
  },
  {
    method: 'POST',
    path: '/mail-accounts/:documentId/messages/:uid/import',
    handler: 'api::mail-account.mail-account.createImport',
  },
];

module.exports = {
  get routes() {
    return [
      ...customRoutes,
      ...defaultRouter.routes,
    ];
  },
};
