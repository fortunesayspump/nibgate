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
