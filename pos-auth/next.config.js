/** @type {import('next').NextConfig} */

const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    transpilePackages: ['@rutba/pos-shared'],
    experimental: {
        disableOptimizedLoading: true,
    },
};

module.exports = nextConfig;
