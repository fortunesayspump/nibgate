import type { NextConfig } from "next";

const _rawApi = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");
// Mirror lib/api.ts: canonical backend paths are bare, so strip one /api
// suffix for the rewrite destination (which re-adds /:path*). Never point
// rewrites at the legacy /api-prefixed form (hub URL standard).
const apiUrl = _rawApi.endsWith("/api") ? _rawApi.slice(0, -"/api".length) : _rawApi;

const nextConfig: NextConfig = {
  transpilePackages: ["@nibgate/wallet"],
  webpack(config, _ctx) {
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.fallback["@x402/svm/exact/client"] = false;
    config.resolve.fallback["accounts"] = false;
    config.resolve.fallback["@walletconnect/ethereum-provider"] = false;
    config.resolve.fallback["porto/internal"] = false;
    config.resolve.fallback["porto"] = false;
    config.resolve.fallback["@metamask/connect-evm"] = false;
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
      {
        source: "/nibgate.json",
        destination: `${apiUrl}/nibgate/manifest`,
      },
    ];
  },
};

export default nextConfig;
