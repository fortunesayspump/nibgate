import type { NextConfig } from "next";

const _rawApi = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");
// Mirror lib/api.ts: exactly one /api suffix, so the rewrite destination
// always keeps the prefix the backend serves (a stripped destination 404s
// every proxied call).
const apiUrl = _rawApi.endsWith("/api") ? _rawApi : `${_rawApi}/api`;

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
