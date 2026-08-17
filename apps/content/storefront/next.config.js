const { createNextConfig } = require('../scripts/js/next-config-base');

/** @type {import('next').NextConfig} */
module.exports = createNextConfig({
  reactStrictMode: false,
  // Restore the previous scroll position on browser back/forward. Without this
  // the storefront lands at the top of the listing/home after viewing a product,
  // forcing the shopper to scroll back down. Listing + home keep their data in
  // the react-query cache, so the full page height is available synchronously on
  // back and the saved position applies cleanly.
  experimental: {
    scrollRestoration: true,
  },
  images: {
	remotePatterns: [
	  {
		protocol: process.env.NEXT_PUBLIC_IMAGE_HOST_PROTOCOL || 'http',
		hostname: process.env.NEXT_PUBLIC_IMAGE_HOST_NAME || 'localhost',
		port: process.env.NEXT_PUBLIC_IMAGE_HOST_PORT || '4010',
		pathname: '/**',
	  },
	],
  },
  typescript: {
	// TODO: fix pre-existing type errors surfaced by React 19 / TS 5.7 upgrade
	ignoreBuildErrors: true,
  },
  // Compatibility redirects — keep legacy plural URLs working.
  async redirects() {
	return [
	  { source: '/pages/:slug', destination: '/page/:slug', permanent: true },
	  { source: '/pages', destination: '/', permanent: true },
	];
  },
});
