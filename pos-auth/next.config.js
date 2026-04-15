const { createNextConfig } = require('../scripts/next-config-base');

/** @type {import('next').NextConfig} */
module.exports = createNextConfig({
  images: false,
  experimental: {
    disableOptimizedLoading: true,
  },
});
