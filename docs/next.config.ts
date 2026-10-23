import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({});

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/sdk-reference",
          destination: "/sdk-reference/index.html",
        },
      ],
    };
  },
};

export default withNextra(nextConfig);
