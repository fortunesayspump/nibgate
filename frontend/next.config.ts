import type { NextConfig } from "next";

let apiUrl = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? "https://api.nibgate.xyz" : "http://localhost:3000")).replace(/\/+$/, '');
if (!/^https?:\/\//.test(apiUrl)) apiUrl = 'https://' + apiUrl;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
