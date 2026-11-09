# Viem Integration Reference

An independent Nibgate-hosted reference for 24 public APIs from the maintained
third-party library [wevm/viem](https://github.com/wevm/viem).

- Target: Viem 2.54.1, matching the Nibgate workspace dependency.
- Source commit: `e6e0c1bef949fbdc837662fbd41ebe739ccae030`.
- Actual permissive license: upstream `src/LICENSE`, retained as `LICENSE.viem`.
- Renderer: Sourcey 3.9.0, using its Markdown adapter.
- Extractor: TypeScript 5.9.3 AST, not manually invented API declarations.
- Public path: `https://docs.nibgate.xyz/viem-reference`.

## Reproduce

```sh
cd docs/viem-reference
npm ci --ignore-scripts
npm run build
npm test
node ../scripts/stage-viem-reference.mjs
```

The `vendor/viem` directory contains exact selected upstream source files and
their associated Markdown examples, not a fork of the library. `inventory.json`
records every input hash. The validator compares all 24 selected npm source
files with the pinned Git files, checks exports and local links, type-checks
examples, and runs deterministic helper assertions.

To rebuild the full hosting app with the repository's Node 22 and pnpm 10.28.0:

```sh
pnpm --filter @nibgate/docs cf:build:static
```

The docs application prebuild installs the pinned Viem reference package and
stages both references under their own additive public paths. Existing hosting
and deployment configuration stays unchanged.
No existing SDK reference or product behavior is replaced.

## Governed Validation

```sh
./node_modules/.bin/runx --version
./node_modules/.bin/runx skill ./runx-validator -i commit=e6e0c1bef949fbdc837662fbd41ebe739ccae030 -j
node scripts/verify-receipts.mjs
```

The new receipt and its complete lineage are published under `evidence/`.
No previous Nibgate-target receipt is reused. No RPC, signing, transaction,
publication or submission occurs inside this validation recipe.

## Scope and Attribution

Source and copied upstream examples are MIT licensed, copyright weth LLC.
The full license is in `LICENSE.viem` and the original `vendor/viem/src/LICENSE`.
The reference is not an official Viem or Circle site and does not claim either
organization's endorsement. See `report.md` for actual findings and limitations.

The verification helper explicitly loads the published local signer public key and verifies both receipts. This establishes content integrity and lineage, not an upstream endorsement or third-party notary identity.
