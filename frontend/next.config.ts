import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/.well-known/:path*",
        destination: "http://localhost:3000/.well-known/:path*",
      },
    ];
  },
};

export default nextConfig;
