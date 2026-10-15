import type { NextConfig } from "next";
import path from "node:path";

const _rawApi = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");
// Most backend routes have bare-path aliases, but the paid post mirror is
// mounted only under /api/<type>/<slug>. Keep the prefix for same-origin
// requests so the advertised access URL reaches its x402 handler.
const apiUrl = _rawApi.endsWith("/api") ? _rawApi.slice(0, -"/api".length) : _rawApi;

const nextConfig: NextConfig = {
  // Include workspace package sources and dependencies in the server trace.
  outputFileTracingRoot: path.join(__dirname, "../.."),
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
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/nibgate.json",
        destination: `${apiUrl}/nibgate/manifest`,
      },
    ];
  },
};

export default nextConfig;
