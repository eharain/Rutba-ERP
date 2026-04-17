'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/site-setting/publish',
      handler: 'site-setting.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/site-setting/unpublish',
      handler: 'site-setting.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/site-setting/discard',
      handler: 'site-setting.discardDraft',
      config: { auth: false },
    },
  ],
};
