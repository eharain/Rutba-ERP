/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  images: {
	remotePatterns: [
	  {
		protocol: process.env.NEXT_PUBLIC_IMAGE_HOST_PROTOCOL || 'http',
		hostname: process.env.NEXT_PUBLIC_IMAGE_HOST_NAME || 'localhost',
		port: process.env.NEXT_PUBLIC_IMAGE_HOST_PORT || '4010',
		pathname: "/**",
	  },
	],
  },
  eslint: {
	ignoreDuringBuilds: true
  },
  typescript: {
	// TODO: fix pre-existing type errors surfaced by React 19 / TS 5.7 upgrade
	ignoreBuildErrors: true
  }
};

module.exports = nextConfig;
