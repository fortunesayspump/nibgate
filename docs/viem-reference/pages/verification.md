# Verification Boundaries

## Reproduce the Build

From the `docs/viem-reference` directory of the Nibgate repository:

```sh
npm ci --ignore-scripts
npm run build
npm test
```

The committed vendor inputs are exact selected files from the pinned public Viem commit. The generator reads their TypeScript AST and associated upstream documentation. Validation checks file hashes, the installed npm version, source equality between npm and the pinned files, all 24 public exports, local links, anchor targets, rendered provenance and deterministic helper results.

## What Is Checked

- Twenty-four public function exports and source-mapped signatures.
- Pinned input hashes and the actual MIT license text.
- Equality of the selected npm source files with the Git source used for the reference.
- Examples type-checked with TypeScript 5.9.3. Dependency declaration internals are skipped with `skipLibCheck`.
- Pure helper assertions for amounts, UTF-8 encoding, hashing, signature recovery and ABI round trips.
- Generated pages, local links, fragments and machine-readable `llms.txt` output.

## What Is Not Claimed

- No live RPC or wallet operation is executed by these checks.
- No payment, deposit, withdrawal, account permission request or transaction signing occurs.
- The upstream full test suite is not run. These are focused documentation and integration checks.
- The full Viem type graph and every method returned by a client are not expanded by this custom adapter.
- Examples copied from upstream remain in their original example context. They are not records of Nibgate account activity.
- Source generation does not establish endorsement by the upstream maintainers.

## Build Evidence

The reference source package includes `inventory.json`, `evidence/validation.json`, `evidence/build-hashes.json`, the Sourcey configuration, the extraction and validation scripts, and the governed validation recipe. The delivery evidence adds the sealed runx receipt and the exact CLI version used.

The [maintainer report](https://github.com/fortunesayspump/nibgate/blob/main/docs/viem-reference/report.md) explains the checked behavior and remaining gaps. The bounty delivery pins its evidence and report URLs to an immutable commit rather than relying on this moving branch link.
