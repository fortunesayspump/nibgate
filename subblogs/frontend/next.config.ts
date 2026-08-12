import type { NextConfig } from "next";

let apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/+$/, '').replace(/\/api$/, '');

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
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/nibgate.json",
        destination: `${apiUrl}/api/nibgate/manifest`,
      },
    ];
  },
};

export default nextConfig;
