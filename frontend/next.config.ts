import type { NextConfig } from "next";

let apiUrl = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? "https://api.nibgate.xyz" : "http://localhost:3000")).replace(/\/+$/, '');
if (!/^https?:\/\//.test(apiUrl)) apiUrl = 'https://' + apiUrl;

const nextConfig: NextConfig = {
  transpilePackages: ["@nibgate/wallet"],
  turbopack: {},
  webpack(config, _ctx) {
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.fallback["@x402/svm/exact/client"] = false;
    config.resolve.fallback["accounts"] = false;
    config.resolve.fallback["@walletconnect/ethereum-provider"] = false;
    config.resolve.fallback["porto"] = false;
    config.resolve.fallback["porto/internal"] = false;
    config.resolve.fallback["@metamask/connect-evm"] = false;
    return config;
  },
  async redirects() {
    return [
      {
        source: "/ns",
        destination: "/share",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const bare = ["hub", "nibshare", "auth", "newsletter", "uploads", "app"];
    return [
      ...bare.map((group) => ({
        source: `/${group}/:path*`,
        destination: `${apiUrl}/${group}/:path*`,
      })),
      {
        source: "/rpc",
        destination: `${apiUrl}/rpc`,
      },
      {
        source: "/openapi.json",
        destination: `${apiUrl}/openapi.json`,
      },
      {
        source: "/blog/admin/:path*",
        destination: `${apiUrl}/blog/admin/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/.well-known/llms.txt",
        destination: "/llms.txt",
      },
      {
        source: "/.well-known/llms-full.txt",
        destination: "/llms-full.txt",
      },
    ];
  },
  async headers() {
    const llmsHeaders = [
      { key: "X-Llms-Txt", value: "/llms.txt" },
      { key: "X-Llms-Full-Txt", value: "/llms-full.txt" },
    ];
    return [
      {
        source: "/:path*",
        headers: llmsHeaders,
      },
    ];
  },
};

export default nextConfig;
