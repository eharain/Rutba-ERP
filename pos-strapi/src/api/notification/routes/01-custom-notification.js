module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'POST',
      path: '/notifications/process-event',
      handler: 'api::notification.notification.processEvent',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/notifications/me',
      handler: 'api::notification.notification.myNotifications',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/notifications/:documentId/read',
      handler: 'api::notification.notification.markAsRead',
      config: { auth: false },
    },
  ],
};
