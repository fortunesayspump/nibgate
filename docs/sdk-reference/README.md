# Nibgate SDK Sourcey reference

This directory generates the additive Sourcey reference served by the existing
Nibgate Nextra documentation project at `/sdk-reference`.

## Reproduce locally

Node 22.19 or newer is required.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run check:examples
npm run build:evidence
```

Run the full documentation build from `docs/`:

```sh
npm run build
```

The prebuild regenerates Sourcey and stages `dist/` into the ignored
`docs/public/sdk-reference/` directory before Next.js builds. The clean
`/sdk-reference` route is rewritten to the generated index; child pages and
assets remain under the same path prefix.

## Governed validation

The successful run used:

```sh
runx skill ./runx-validator \
  --run-id nibgate-sourcey-345fc04b-v4 \
  -i commit=345fc04b984f01366cbe2a9f4064f22268d5d3f6 \
  --json
```

Sealed receipt: `runx:receipt:sha256:80092c05444726afcd0953c330070a67e4794220d2873d9cd2cf8bbb1b80d46d`.
The complete two-receipt tree is in `evidence/runx-receipts/`, with the root
also copied to `evidence/receipt.json`.

## Production handoff

Keep the current Vercel project rooted at `docs/` and the current
`docs.nibgate.xyz` domain. The checked-in `vercel.json` installs both the frozen
workspace and nested Sourcey dependencies; its existing build command invokes
the new prebuild automatically.

Before promotion, test the exact staged production build and confirm HTTP 200
for:

- `https://<staged-host>/sdk-reference`
- `https://<staged-host>/sdk-reference/pages/api/checkresourceaccess.html`
- one generated file beneath `https://<staged-host>/sdk-reference/_assets/`
- `https://<staged-host>/sdk-reference/llms.txt`

After promotion, repeat those checks on `https://docs.nibgate.xyz`. Do not use a
preview or `vercel.app` URL as the bounty `public_url`; the durable intended URL
is `https://docs.nibgate.xyz/sdk-reference`.
