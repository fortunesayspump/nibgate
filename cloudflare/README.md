# Cloudflare frontend builds

These targets prepare the existing frontend Workers; they do not deploy by themselves. Run from the repository root with Node 22 and the pinned pnpm dependencies:

```sh
pnpm install --frozen-lockfile
node scripts/cloudflare-build.mjs <target>
```

Targets are `hub-mainnet`, `hub-testnet`, `creator-mainnet`, `creator-lowfi`, `creator-testnet`, and `docs`. Hub and creator output is staged under `.cloudflare-build/hub/<network>` or `.cloudflare-build/creator/<network>`; docs outputs to `docs/out`. Use the staged `wrangler.jsonc` for a reviewed deployment. Creator mainnet and Lowfi share an output directory, so build and deploy each target separately. Testnet creator has no production route in its configuration.

Set `NEXT_PUBLIC_NIBGATE_NETWORK` and `NEXT_PUBLIC_API_URL` for the target. Creator builds also require `NEXT_PUBLIC_HUB_API_URL`. Hub builds require the existing public Dr. Nib build settings and the matching broker and funding origins; the build script lists the required names and verifies the network-specific origins. Supply values through the build environment, not committed files. Railway remains the backend and retains its private credentials.

Do not enable an automatic production deployment yet. The clean build does not retain hashed assets from prior deployments, which can break already-open tabs. The pinned OpenNext adapter also declares a different Next.js peer range from this repository, even though local builds and synthetic tests have passed. Testnet creator still requires a compatible existing backend and domain/TLS configuration. Live authentication and payment flows have not been verified by these synthetic tests.
