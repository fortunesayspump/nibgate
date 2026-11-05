import assetsCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// This is deliberately not an ISR store. The staging script copies only routes
// with initialRevalidateSeconds === false. No fetch, tenant or mutable data is
// populated here. Unknown keys fall through to Next, preserving dynamic behavior.
export default {
  name: "nibgate-immutable-build-cache",
  get: assetsCache.get.bind(assetsCache),
  async set() {},
  async delete() {},
};
