const { createNextConfig } = require('../scripts/js/next-config-base');

/** @type {import('next').NextConfig} */
module.exports = createNextConfig({
  experimental: {
    clientRouterFilter: false,
  },
});
