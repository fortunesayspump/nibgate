import type { NextConfig } from "next";
import path from "node:path";
import nextra from "nextra";

const withNextra = nextra({});

const staticPreview = process.env.NIBGATE_DOCS_STATIC === "1";

const nextConfig: NextConfig = {
  ...(staticPreview ? { output: "export", images: { unoptimized: true } } : {}),
  outputFileTracingRoot: path.join(__dirname, ".."),
  ...(staticPreview ? {} : {
    async rewrites() {
      return {
        beforeFiles: [
          { source: "/sdk-reference", destination: "/sdk-reference/index.html" },
          { source: "/viem-reference", destination: "/viem-reference/index.html" },
        ],
      };
    },
  }),
};

export default withNextra(nextConfig);
