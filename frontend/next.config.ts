import type { NextConfig } from "next";

let apiUrl = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? "https://api.nibgate.xyz" : "http://localhost:3000")).replace(/\/+$/, '');
if (!/^https?:\/\//.test(apiUrl)) apiUrl = 'https://' + apiUrl;

// Dr. Nib is a separate service. The hub frontend reaches it through this
// same-origin proxy so the `.nibgate.xyz` SIWE session cookie is sent — a
// direct cross-origin call to a *.up.railway.app host would not carry a
// .nibgate.xyz cookie and every authenticated request would 401.
//
// The backend is chosen by build network (overridable with DRNIB_API_URL):
// mainnet builds talk to the mainnet service, testnet builds to the testnet
// service (which must exist — see dr-nib/DEPLOY.md "Testnet service").
const buildNetwork = (process.env.NEXT_PUBLIC_NIBGATE_NETWORK || "testnet").toLowerCase();
let drnibUrl = (process.env.DRNIB_API_URL || (process.env.NODE_ENV === "production"
  ? (buildNetwork === "mainnet" ? "https://drnib.nibgate.xyz" : "https://drnib.testnet.nibgate.xyz")
  : "http://localhost:3100")).replace(/\/+$/, '');
if (!/^https?:\/\//.test(drnibUrl)) drnibUrl = 'https://' + drnibUrl;

// Confidential routes use a separately deployed broker-only process. Keeping
// a distinct rewrite prevents the synthetic test from switching or sharing
// the ordinary Dr. Nib API, queues, workers, storage, exports or payments.
let privateDrnibUrl = (process.env.DRNIB_PRIVATE_API_URL || (process.env.NODE_ENV === "production"
  ? (buildNetwork === "mainnet" ? "https://private-drnib.nibgate.xyz" : "https://private-drnib.testnet.nibgate.xyz")
  : "http://localhost:3103")).replace(/\/+$/, '');
if (!/^https?:\/\//.test(privateDrnibUrl)) privateDrnibUrl = 'https://' + privateDrnibUrl;

const nextConfig: NextConfig = {
  transpilePackages: ["@nibgate/wallet"],
  turbopack: {},
  images: {
    // Plain object (not a URL): a URL instance pins `search: ""` and any
    // image URL with a query string then fails the match and 500s the page.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  webpack(config, { isServer, webpack }) {
    config.resolve = config.resolve || {};
    config.resolve.fallback = config.resolve.fallback || {};
    config.resolve.fallback["@x402/svm/exact/client"] = false;
    config.resolve.fallback["accounts"] = false;
    config.resolve.fallback["@walletconnect/ethereum-provider"] = false;
    config.resolve.fallback["porto"] = false;
    config.resolve.fallback["porto/internal"] = false;
    config.resolve.fallback["@metamask/connect-evm"] = false;
    if (!isServer) {
      // The official DCAP QVL browser build uses Node crypto, stream and Buffer.
      config.resolve.fallback.crypto = require.resolve("crypto-browserify");
      config.resolve.fallback.stream = require.resolve("stream-browserify");
      config.resolve.fallback.buffer = require.resolve("buffer/");
      config.plugins.push(new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
      }));
    }
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
      // Same-origin proxy to the Dr. Nib service (see drnibUrl above).
      {
        source: "/drnib-api/:path*",
        destination: `${drnibUrl}/:path*`,
      },
      {
        source: "/drnib-private-api/:path*",
        destination: `${privateDrnibUrl}/:path*`,
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
