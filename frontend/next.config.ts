import type { NextConfig } from "next";
import path from "node:path";

let apiUrl = (process.env.NEXT_PUBLIC_API_URL || "https://api.nibgate.xyz").replace(/\/+$/, '');
if (!/^https?:\/\//.test(apiUrl)) apiUrl = 'https://' + apiUrl;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/.well-known/:path*",
        destination: `${apiUrl}/.well-known/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      accounts: path.resolve(__dirname, 'src/lib/empty-accounts.ts'),
    }
    return config
  },
  turbopack: {
    resolveAlias: {
      accounts: './src/lib/empty-accounts.ts',
    },
  },
};

export default nextConfig;
