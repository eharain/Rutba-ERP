/** @type {import('next').NextConfig} */

function generateRemotePatterns(urls) {
    const seen = new Set();

    return urls
        .map((u) => {
            try {
                const { hostname, protocol, pathname, port } = new URL(u);
                const key = `${protocol}//${hostname}:${port || ""}`;
                if (seen.has(key)) return null;
                seen.add(key);

                return {
                    protocol: protocol.replace(":", ""),
                    hostname,
                    port: port || undefined,
                    pathname: "/**",
                };
            } catch {
                return null;
            }
        })
        .filter((f) => f?.hostname);
}

const urls = [
    "http://localhost:1338/uploads/abc.jpg",
    "http://127.0.0.1:1338/uploads/xyz.png",
    process.env.NEXT_PUBLIC_API_URL,
];

const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ['@rutba/pos-shared'],
    images: {
        remotePatterns: generateRemotePatterns(urls)
    },
};

module.exports = nextConfig;
