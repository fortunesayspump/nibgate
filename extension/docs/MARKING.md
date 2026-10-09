# Marking content in HTML

How tippable content is identified in a page — by the extension on arbitrary
sites, and by Nibgate surfaces natively. One convention everywhere so the
content script, the hub API, and agents agree on what "this content" means.

## The two marker kinds

**1. Page-declared slots** (read by `content/extract.ts`, routing only):

```html
<div data-nibgate-recipient="0xCreator…"></div>
<div data-nibgate-site="example.com" data-nibgate-resource="/posts/123"></div>
```

| Attribute | Meaning | Who sets it |
|---|---|---|
| `data-nibgate-recipient` | explicit payout wallet for this content | page / SDK render |
| `data-nibgate-site` / `data-nibgate-resource` | site + resource identity | page / SDK render |

**2. Assessment verdicts** (written by `content/tip-card.ts` onto
`document.documentElement` after the page model + hub resolution run):

| Attribute | Meaning |
|---|---|
| `data-nibgate-widget` | mount point of the coffee-button trigger |
| `data-nibgate-kind` | page kind: `content`, `feed`, `landing`, `app`, `brand`, `unknown` (`platform` on Nibgate-owned hosts) |
| `data-nibgate-type` | content type: `article`, `video`, `audio`, `gallery`, `paper`, `code`, `discussion`, `product`, `unknown` |
| `data-nibgate-eligible` | `1` = tip trigger renders, `0` = hold/skip with a visible reason |
| `data-nibgate-reason` | first human-readable reason from the JEV verdict |
| `data-nibgate-jev` | resolution probability (0..1) |
| `data-nibgate-assessed` | `1` = assessment ran (prevents double evaluation) |

## Rules

1. Markers are **advisory, never trust roots**. The backend re-extracts,
   re-resolves, and re-decides from the canonical URL. A forged marker buys
   nothing.
2. Missing recipient (or confidence below threshold) means hold-don't-pay —
   the trigger must say funds will be held, visibly.
3. Nibgate-owned hosts are treated as pre-resolved (`kind=platform`) and skip
   extraction — they already tip natively, so the extension stays out of the
   way there too.
