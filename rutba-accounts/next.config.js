const { createNextConfig } = require('../scripts/next-config-base');

/** @type {import('next').NextConfig} */
module.exports = createNextConfig({
  experimental: {
    disableOptimizedLoading: true,
  },
});
