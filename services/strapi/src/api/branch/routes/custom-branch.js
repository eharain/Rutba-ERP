module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/branches/:id/archive-stock',
      handler: 'archive.archiveStock',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/branches/:id/unarchive-stock',
      handler: 'archive.unarchiveStock',
      config: {
        auth: false,
      },
    },
    {
      method: 'GET',
      path: '/branches/:id/archive-stats',
      handler: 'archive.archiveStats',
      config: {
        auth: false,
      },
    },
  ],
};
