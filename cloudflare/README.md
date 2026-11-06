# Cloudflare frontend builds

These targets prepare the existing frontend Workers; they do not deploy by themselves. Run from the repository root with Node 22 and the pinned pnpm dependencies:

```sh
pnpm install --frozen-lockfile
npm ci --prefix cloudflare/tooling --ignore-scripts --legacy-peer-deps
node scripts/cloudflare-build.mjs <target>
```

Targets are `hub-mainnet`, `hub-testnet`, `creator-mainnet`, `creator-lowfi`, `creator-testnet`, and `docs`. Hub and creator output is staged under `.cloudflare-build/hub/<network>` or `.cloudflare-build/creator/<network>`; docs outputs to `docs/out`. Use the staged `wrangler.jsonc` for a reviewed deployment. Creator mainnet and Lowfi share an output directory, so build and deploy each target separately. Testnet creator has no production route in its configuration.

Use `node cloudflare/tooling/node_modules/wrangler/bin/wrangler.js` with the appropriate staged config for Wrangler commands. Tool dependencies have a separate lockfile so this frontend-only change does not alter the Railway-watched root package files.

Set `NEXT_PUBLIC_NIBGATE_NETWORK` and `NEXT_PUBLIC_API_URL` for the target. Creator builds also require `NEXT_PUBLIC_HUB_API_URL`. Hub builds require the existing public Dr. Nib build settings and the matching broker and funding origins; the build script lists the required names and verifies the network-specific origins. Supply values through the build environment, not committed files. Railway remains the backend and retains its private credentials.

The archives in `cloudflare/previous-static` contain public `_next/static` files from the manual Hub and mainnet creator deployments. Builds merge those files without overwriting a different file at the same path, preserving those prior releases' chunks. This is a bounded snapshot, not automatic retention of every future build; a rollout plan is still needed for tabs from later releases.

The pinned OpenNext adapter declares a different Next.js peer range from this repository, even though local builds and synthetic tests have passed. Testnet creator still requires a compatible existing backend and domain/TLS configuration. Live authentication and payment flows have not been verified by these synthetic tests.
