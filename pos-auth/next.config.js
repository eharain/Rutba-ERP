/** @type {import('next').NextConfig} */

const nextConfig = {
    reactStrictMode: true,
    output: 'standalone',
    transpilePackages: ['@rutba/pos-shared'],
};

module.exports = nextConfig;
