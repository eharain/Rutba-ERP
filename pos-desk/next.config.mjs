/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: "http",
                hostname: "localhost",
                port: "4010", // <-- your Strapi port
                pathname: "/uploads/**",
            },
        ],
    },
};

export default nextConfig;
