# Marking content in HTML

How tippable content is identified in a page — by the extension on arbitrary
sites, and by Nibgate surfaces natively. One convention everywhere so JEV,
the API, and agents agree on what "this content" means.

## The marker set

```html
<article
  data-nibgate-content="a1b2c3d4"
  data-nibgate-title="Why tipping beats ads"
  data-nibgate-creator="0xCreator…"
  data-nibgate-tip="0.25"
  data-nibgate-confidence="0.92">
```

| Attribute | Meaning | Who sets it |
|---|---|---|
| `data-nibgate-content` | content fingerprint (FNV-1a hex; backend re-hashes authoritatively) | extractor / SDK render |
| `data-nibgate-title` | extracted title | extractor |
| `data-nibgate-creator` | resolved wallet, empty when unresolved | JEV identity decision |
| `data-nibgate-tip` | suggested amount USDC | JEV amount decision |
| `data-nibgate-confidence` | resolution confidence 0..1 | JEV identity decision |

## Rules

1. Markers are **advisory, never trust roots**. The backend re-extracts,
   re-resolves, and re-decides from the canonical URL. A forged marker buys
   nothing.
2. Missing `data-nibgate-creator` (or confidence below threshold) means
   hold-don't-pay — the card must say so visibly.
3. Nibgate-owned surfaces (subblogs, hub, nibshare) emit the same markers
   server-side with confidence `1.0` — the extension treats them as
   pre-resolved and skips extraction.
4. Fingerprints match if either side's normalized hash agrees; on mismatch
   the backend copy wins and the marker is ignored for identity (kept for
   display).
