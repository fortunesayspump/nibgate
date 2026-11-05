import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({
  // Only immutable prerendered entries are staged; ISR/fetch entries stay misses.
  incrementalCache: () => import("./cloudflare/immutable-cache").then(m => m.default),
  enableCacheInterception: true,
});
// Match the existing wallet and browser-crypto Webpack configuration.
config.buildCommand = "pnpm exec next build --webpack";
export default config;
