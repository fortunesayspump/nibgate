# Viem Sourcey Reference: Maintainer Report

## Target and Audience

The documented project is **wevm/viem**, a maintained third-party MIT-licensed
TypeScript library, not Nibgate's own SDK. The pinned source is Viem 2.54.1 at
`e6e0c1bef949fbdc837662fbd41ebe739ccae030`, matching Nibgate's workspace version.
The actual upstream license text is retained, and every API page links to the
corresponding public source lines. Recent upstream activity was independently
checked at commit `17c2c520e8ffb4fa09473422fdf84a1b8ff1469d`, dated November 8, 2026.

The intended readers are Nibgate integrators who already encounter Viem when
constructing client transports, encoding calls, checking addresses, recovering
message signers and handling token amounts. The live docs home, its Reference
navigation and the existing payments guide link this focused reference. It is
clearly labelled independent and links to Viem's official documentation.

## Verified Findings and Useful Gaps

- **Raw source comments are insufficient for a complete reference.** Fourteen
  of the 24 selected implementation declarations have no function-level JSDoc,
  and sixteen have no source `@example` tag. For example, `encodeFunctionData`
  and `recoverMessageAddress` expose types and implementations but no function
  description. The extractor therefore joins actual AST signatures with
  examples from the same pinned upstream docs. A future TypeScript adapter
  should make that join explicit instead of silently omitting undocumented
  exports or inventing descriptions. The inventory records these counts.
- **Payment precision deserves a visible warning.** The pinned `parseUnits`
  implementation rounds excess precision; the executed check returns
  `1000001n` for `parseUnits('1.0000009', 6)`. The pinned utility docs describe
  multiplication but do not explain that rounding branch. The reference adds
  an integration note to validate amount precision before conversion. This
  is an observed behavior, not a claim of a Viem defect.
- **Client return types are larger than the selected export surface.** The
  extractor preserves the two `createWalletClient` declarations and 75 local
  exported type declarations across the selected files, but does not expand
  imported type graphs or all methods returned by clients. That is an adapter
  coverage limitation. Source links and the official reference remain visible;
  this work does not call the 24-page slice the complete Viem API.
- **Upstream code examples have external context.** Some examples refer to a
  local ABI module or an injected wallet and use an upstream example chain.
  Copying them without that context can imply they are drop-in Nibgate payment
  code. Each page labels the example as upstream code, while the separate
  type-check fixture imports every selected API and uses explicit provider
  and RPC inputs. None of those examples is presented as live account activity.
- **Encoding and decoding are not settlement proof.** The deterministic tests
  check real ABI round trips, UTF-8/hex conversion and signature recovery.
  They do not verify the network, emitting contract, recipient, transaction
  success or replay controls of a production payment. Integration notes call
  out those remaining checks at `encodeFunctionData`, `decodeFunctionData`,
  `decodeEventLog` and `recoverMessageAddress` instead of claiming a decoded
  value proves a successful purchase.
- **The supported integration version is not the newest release.** Nibgate
  declares 2.54.1; upstream was at 2.57.17 when current maintenance was checked.
  Pinning the integration version makes the reference reproducible but leaves
  upgrade review as a real maintenance task. Every selected npm source file is
  compared byte-for-byte with its pinned Git counterpart so a registry/source
  mismatch cannot be hidden behind a version string.
- **Sourcey normalizes API route casing.** A first validation caught that
  `createPublicClient` renders to `pages/api/createpublicclient.html`. The
  inventory now uses generated lowercase paths, and local link checks cover
  navigation, styles, search assets and cross-page references. This matters
  on case-sensitive static hosts, where an attractive page can still link to
  a missing file.
- **The checks are deliberately bounded.** Sixteen pure-helper assertions,
  export checks and strict example type-checking are focused documentation
  tests. `skipLibCheck` excludes dependency declaration internals, and neither
  the complete upstream test suite nor live RPC/wallet flows is claimed as
  executed. The evidence records those exclusions as explicit booleans.

## Reproduction and Evidence

The custom AST extractor feeds real upstream API data to Sourcey's Markdown
adapter. Run `npm ci --ignore-scripts`, `npm run build` and `npm test` from this
directory. The committed configuration and scripts retain the exact versions.
`inventory.json` contains 24 exports and 51 pinned inputs; validation records
29 generated HTML files and 1,041 checked local references in the initial build.
The final evidence packet and governed receipt are authoritative for final
counts and hashes.

The new runx validation seals the Sourcey rebuild and checks. Its receipt is
published verbatim together with all lineage receipts and can be recomputed
with `node scripts/verify-receipts.mjs`. The delivery uses
immutable commit-pinned URLs for the evidence, report and receipt files.

## Publication Qualification

`docs.nibgate.xyz` is an existing product documentation home, not a preview or
newly created catalogue. Its parent product has a real integration audience for
Viem and links to these docs. The published bounty permits credible product or
documentation domains, but some prior reviews required upstream-controlled
publication. This packet does not imply upstream adoption or conceal that
hosting interpretation. The library target, license, source generation and
receipt have been corrected independently of that remaining judgment call.
