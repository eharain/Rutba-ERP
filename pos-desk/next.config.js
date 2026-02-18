/** @type {import('next').NextConfig} */

/** @type {import('next').NextConfig} */

function generateRemotePatterns(urls) {
    const seen = new Set();

    return urls
        .map((u) => {
            try {
                const { hostname, protocol, pathname, port } = new URL(u);

                // Normalize: avoid duplicates by proto+host+port
                const key = `${protocol}//${hostname}:${port || ""}`;
                if (seen.has(key)) return null;
                seen.add(key);

                return {
                    protocol: protocol.replace(":", ""), // "http" or "https"
                    hostname,                            // e.g. "localhost" or "cdn.domain.com"
                    port: port || undefined,             // use actual port if present
                    pathname: "/**",                     // allow all media files
                };
            } catch {
                return null;
            }
        })
        .filter((f) => f?.hostname);
}

const urls = [
    "http://localhost:4010/uploads/abc.jpg",
    "http://127.0.0.1:4010/uploads/xyz.png",
    process.env.NEXT_PUBLIC_API_URL,
];


const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns:generateRemotePatterns(urls)
    },
};

module.exports = nextConfig;
