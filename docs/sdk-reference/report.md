# Nibgate SDK 0.4.40 Sourcey report

This reference was generated from public commit
`345fc04b984f01366cbe2a9f4064f22268d5d3f6` and documents 27 methods actually
bound by `createNibgate()` plus the separately exported
`validateResourceMetadata` helper. Sourcey 3.9.0 produced the navigable static
site from generated Markdown pages whose signatures and source links are
derived from the pinned TypeScript declarations and JavaScript implementation.

## Maintainer-facing findings

- `NibgateClient` declares 28 methods, but `createNibgate()` binds only 27.
   `validateResourceMetadata` is available as a standalone export and is not a
   client method at runtime. The declaration should remove that member or the
   runtime client should bind it.
- The public declaration refers to `NibgateTransferCheckoutOptions` and
   `NibgateTransferCheckout`, but neither type is declared. A strict consumer
   type-check reports six `TS2304`/`TS2552` errors. The documentation examples
   therefore pass only with `skipLibCheck`, and the unfiltered compiler output
   is preserved in `evidence/upstream-types.txt`.
- `mountRatingUI` calls `.catch()` on `rateResource(...)`, although
   `rateResource` returns a boolean. A star-button click can therefore throw a
   `TypeError` after emitting the rating event.
- `NibgateRatingUiController.rate` is declared as an onchain-style method that
   accepts a resource and returns `ReturnType<typeof rateContentOnchain>`. The
   runtime controller accepts a rating value and calls the local event gate,
   returning a boolean. The public declaration and implementation describe
   different operations.
- `payWithPaymentSignature` accepts optional options in the declaration, but
   its no-signature path invokes `checkout(...)` without first verifying that a
   checkout callback exists. Calling the apparently valid zero-options form can
   fail with an unhelpful callback `TypeError`.
- The `self` success branch of `payWithPaymentSignature` returns a compact
   object with `self: true`, payment, resource, and status, while the declared
   success union requires payload and response. Consumers cannot accurately
   narrow this real result from the published type.
- Event methods return `false` both when an event is queued for a later hub
   flush and when no browser window exists. This makes `false` ambiguous for
   callers; an explicit queued/no-browser result would make telemetry behavior
   easier to observe and test.
- The SDK package declares `MIT` in `packages/nibgate/package.json`, but the
   pinned repository contains no root or package-level `LICENSE` file. The
   package metadata is the available license evidence; adding the matching
   license text would make reuse terms independently verifiable.

## Coverage limits

The site is a browser-client reference. It does not claim complete coverage of
the server, tracking, testing, wallet, tip, or internal helper entrypoints.
Examples involving signers, providers, transfers, and payment signatures are
compile-checked integration shapes only. No wallet prompt, transfer, payment,
RPC submission, live access route, or financial operation was executed.

## Publication and receipt

The additive reference is live on the project's existing permanent documentation
domain at <https://docs.nibgate.xyz/sdk-reference>. Vercel deployment
`dpl_FiYa7qja2F9QgoH7q1eK7FX84nfF` reached `READY` for Git commit
`0fb277226d2785ab0dff48eee9fa397a6accac66`, attached `docs.nibgate.xyz`
without an alias error, and preserved the existing Nextra documentation.
Production checks returned HTTP 200 for the Sourcey root, representative API
pages, Markdown output, `llms.txt`, JavaScript, CSS, search data, the Nextra home
page, and its existing API reference page.

The fresh successful governed validation is sealed as
`runx:receipt:sha256:80092c05444726afcd0953c330070a67e4794220d2873d9cd2cf8bbb1b80d46d`.
The checked-in `evidence/receipt.json` and `evidence/runx-receipts/` tree make
the signed root and child receipt publicly inspectable alongside this report.

## Deployment design

The existing Nextra application remains the owner of `docs.nibgate.xyz`.
During its normal build, `docs/package.json` rebuilds Sourcey and
`docs/scripts/stage-sdk-reference.mjs` copies the static output only into
`docs/public/sdk-reference`. `docs/next.config.ts` rewrites the clean
`/sdk-reference` path to the generated `index.html`; every generated child page
and asset already carries the `/sdk-reference` base path. The existing Nextra
API overview and `llms.txt` index link to the reference.

Vercel's existing docs project can publish the result with the same root
directory and domain. Its install command now installs the pinned nested
Sourcey dependencies after the existing frozen pnpm workspace install. Its
build command is unchanged. Production publication should use a reviewed commit
on the existing docs project, verify a staged production build, then promote
that exact build so `https://docs.nibgate.xyz/sdk-reference` becomes the durable
public URL without replacing the Nextra documentation.
