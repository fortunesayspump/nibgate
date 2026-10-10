# Dr. Nib — live end-to-end test record

What was actually run, what happened, and what it revealed. Written after a
live attempt on **2026-10-07** against the local stack (mainnet-presented UI,
testnet-funded backend). Not a design doc — a record.

## How it was run

Stack (all local, real infra, no mocks):

| Service | Command | Port |
|---|---|---|
| Hub API | `pnpm --filter @nibgate/backend dev` | 3000 |
| Dr. Nib API + worker | `pnpm --filter @nibgate/dr-nib-backend dev` | 3100 |
| Hub frontend (mainnet-presented) | `pnpm --filter @nibgate/frontend dev` | 3001 |
| Database | shared testnet Postgres via `hayabusa.proxy.rlwy.net:23580` | — |

Auth is the hub SIWE session; the tests sign in as the keeper test wallet
(`NIBGATE_KEEPER_PRIVATE_KEY` in `backend/.env`).

Suites:

```bash
# API level: auth gating, validation, escrow reads, full run (needs DRNIB_E2E_FULL=1)
npx playwright test -c e2e/playwright.drnib.config.ts

# Browser level: real clicks through the frontend
npx playwright test -c e2e/playwright.drnib-ui.config.ts
#   attach to an existing run instead of composing a new one:
#   $env:DRNIB_E2E_RUN_ID=<id>; npx playwright test -c e2e/playwright.drnib-ui.config.ts
```

## Results

### 2026-10-09 — production testnet, all green

**Round 3 (final): real report with web citations.** After the score-order
fix deployed, run `edb3b94f` completed with sources from SearXNG web hits
(Kiln Arc explainer, crypto.news Arc mainnet piece) cited as [1] (Arc = L1
by Circle), [2] (dollar-denominated fees, governance reversibility), [4]
(USDC on 32 chains, 1:1 backing). No placeholders, no truncation. Honest
gap remains: no numerical fee/finality figures and zero Base coverage —
needs deeper extraction (fee tables) and broader queries next.

- API suite (`e2e/playwright.drnib.config.ts`, `DRNIB_E2E_FULL=1`): **6/6** —
  auth gating, validation, escrow reads, a fresh full run (intake → cited
  report in ~1.5 min), reprompt v2. Targets overridable via `DRNIB_E2E_HUB` /
  `DRNIB_E2E_API` (SIWE domain follows the hub).
- Browser suite (`e2e/playwright.drnib-ui.config.ts`): **1/1** — full
  click-through on `testnet.nibgate.xyz` (compose → intake → configure →
  plan → approve → report → exports) in ~45s.
- Unit: `src/llm/` 32/32 (incl. 4 new section-retry tests), hub
  `helpers.test.js` 30/30.
- Path here: the run first parked on empty OpenRouter credits (see Open
  below), then froze mid-fetch when a Railway redeploy (variable sets)
  replaced the process running its inline queue — ended cleanly ($0.05
  spent, $1.95 refunded) and re-fired fresh. The e2e poll loop now resumes
  `paused` runs instead of timing out on them.

### 2026-10-07 — local stack (history)

| Check | Result | Notes |
|---|---|---|
| API suite, free tier | **4 passed, 2 skipped** | auth gating, validation, escrow-reads — no spend |
| API full run, attempt 1 | **failed** | `plan` step: `Transaction API error: Unable to start a transaction in the given time` (remote DB proxy) |
| API full run, attempt 2 | **completed** (run `80bf1397`) | 10 steps, 5 sources, 1 report, settled + refunded — but exceeded the test's then-12-min cap, so the test reported timeout while the run itself finished |
| Browser click-through | **partial** (run `afd319f4`) | rendered, signed in, composed, configured, planned, approved, entered the live run — then the agent parked mid-run awaiting an answer; the suite (before the fix) did not answer it |
| Exports | **not exercised live** | renderers verified by unit tests; R2 upload verified separately |

### The completed run (`80bf1397`)

- Status: `complete`. Created 10:25:47Z, finished 10:40:41Z (~15 min).
- Steps: `plan, search, fetch, data, score, search, fetch, data, score, write`.
- Sources scored: 5. Claims: 0. Report: v1, 6,583 chars.
- Ledger: deposit 2.00 → spends 0.2279 + fees 0.0023 → **refund 1.7712**. The
  pause-at-cap / settle / refund path worked.

### The browser run (`afd319f4`)

Clicked in a real Chromium page: composer send → "Just plan it" → configure
(depth quick, cap 2, word output) → "Plan run" → "Approve & run" → landed on
the run command-center page and began executing. It then **parked** with a
mid-run question (`status: awaiting`) — a real product behaviour the UI
surfaces with an answer box; the test simply didn't answer it.

## Problems this exposed

1. **Shared testnet DB is flaky.** The Railway proxy intermittently drops
   connections (`P1001`) and stalls long enough for Prisma's interactive
   transaction to lapse. This is the single biggest obstacle to a reliable live
   run. Hardened in this pass:
   - `eventlog.js`: `$transaction({ maxWait: 20s, timeout: 30s })` + transient
     retry.
   - `db.js`: pool/connect timeouts appended to the URL; `P1002`/`P2024` added
     to the retryable set.
   A **local Postgres** would remove this entirely; none was available.
2. **The writer can return empty text.** `write` step:
   `llmError: "section 1: model returned empty text"` — section 1 shipped as
   `[Section pending: the model could not write this section ...]`. Needs a
   per-section retry/fallback.
3. **Retrieval quality was poor for a current-events question.** With no
   SearXNG running, the free bench returned academic papers (stablecoin design,
   asset treasuries) for "USDC transfer fees and finality on Arc vs Base", all
   graded very low trust (0.02–0.06). Result: **0 citations, 0 claims**, and a
   report that is honest but nearly empty of the asked-for facts. The honest
   "evidence does not cover this" behaviour is correct; the retrieval that fed
   it was not.
4. **The UI suite must handle mid-run parks.** Fixed: the spec now answers
   `awaiting` boxes and resumes paused runs in a loop until the report lands.
5. **Frontend lagged the backend on exports.** The detail page only exposed
   md/json/bibtex and claimed the binary renderers were "not wired yet". Fixed:
   all seven formats are now buttons, and `downloadExport` handles both the
   base64 and the R2-URL response shapes.

## The report it generated (verbatim, run `80bf1397`, v1)

```markdown
# USDC Transfer Fees and Finality: Arc and Base Compared

This report responds to a narrow question: for a plain USDC transfer, what does each of two networks charge, how is that charge denominated, and how long does the transfer take to become final? The two networks in scope are Arc and Base. The report does not attempt a general comparison of the two chains, their ecosystems, or their suitability for any particular use.

The question matters because fee and finality are the two properties a payment sender feels most directly. A fee quoted in a volatile asset and a fee quoted in the asset being sent are different experiences for a user holding only USDC. Likewise, a transfer that is economically settled in under a second and one that inherits the finality of an underlying layer-one chain are different commitments for a merchant deciding when to release goods or credit a balance. Readers comparing the two networks for payment flows need these two facts stated in comparable terms, with the denomination of each fee made explicit rather than assumed.

The report proceeds in four sections. The first two address transaction fees, taking Arc and then Base, and in each case identify the current fee for a USDC transfer and the unit in which that fee is denominated. The remaining two sections address time to finality, again taking Arc and then Base, and identify the consensus mechanism that determines finality in each case, including whether Base finality depends on Ethereum layer-one finality. Each section is limited to what the available evidence supports; where the evidence does not settle a point, the report says so rather than filling the gap.

## What is the current transaction fee for a USDC transfer on Arc, and how is that fee denominated?

[Section pending: the model could not write this section (model returned empty text).]


## What is the current transaction fee for a USDC transfer on Base, and how is that fee denominated?

The supplied evidence does not cover this question. None of the three sources provided [1][2][3] states a transaction fee for a USDC transfer on Base, describes how Base fees are calculated or set, or indicates the unit in which any such fee is denominated. No figure can therefore be reported here, and no denomination — whether in a network token, in USDC itself, in a fiat unit, or in any other unit — can be asserted on the basis of the evidence supplied. Any specific number or unit offered for this question would be (unsupported). Because the evidence set contains no fee data, no network-level data, and no material on Base's operation, this section is necessarily shorter than the planned length; the alternative would be to fill the gap from outside the evidence, which the brief for this report does not permit.

For completeness, the three sources address the following, none of which bears on the question:

- [1] is a publication and mailing-list page associated with a governance research body, whose visible content concerns a paper on liquidity crises in opaque markets and the NYSE in the Panic of 1907, bank payout policy, regulation and politics, and newsletter subscription options [1]. It contains no material on payment networks, stablecoin transfers, or transaction fees.
- [2] is a classification framework for stablecoin designs. Its excerpt discusses the choice of a consumer price index as a peg and the practical difficulties of measuring and weighting such a basket, and moves on to collateral as a mechanism for giving a circulating currency redemption value and a price floor [2]. This is a conceptual treatment of stablecoin design categories

## Time to Finality for a USDC Transfer on Arc and the Consensus Mechanism That Determines It

The supplied evidence does not cover this section. None of the three sources provided describes Arc, its consensus mechanism, or the time to finality for a USDC transfer on Arc. The excerpts available for [1], [2], and [3] contain no measurement, specification, or description of settlement finality on any named network, and no discussion of how a consensus mechanism would determine such finality. Because the question cannot be answered from the evidence at hand, this section states the gap rather than supplying an answer. Every substantive claim that the section's argument would require is therefore marked below as unsupported.

**What the supplied excerpts do contain**

Source [1], *A Classification Framework for Stablecoin Designs*, is presented through an excerpt concerned with peg design and collateral. The visible text discusses the choice of a consumer price index as a peg and the logistical problems of constructing such a basket, then moves to collateral as a mechanism that gives a circulating currency redemption value and thereby a lower bound on price [1]. This is a framework for classifying stablecoin designs by peg and collateral characteristics. It does not address consensus protocols, block production, settlement finality, or any specific blockchain network, and it does not mention Arc or Base [1].

Source [2], *Payment Network Governance*, is represented in the supplied excerpt only by page furniture: a newsletter sign-up block, a list of mailing options, and unrelated article titles such as a study of the NYSE in the Panic of 1907 [2]. No substantive text on payment network governance, finality, or stablecoin transfers appears in the excerpt [2].

Source [3], *From Digital Asset Treasuries to Enterprise Onchain Credit*, is represented only by a citation line naming an author, a year, and

## Time to finality for a USDC transfer on Base and its dependence on Ethereum L1 finality

The supplied evidence does not answer this section's question. None of the three sources reports a time-to-finality figure for a USDC transfer on Base, describes how Base sequences, confirms, or finalises transactions, or states whether finality on Base is contingent on Ethereum L1 finality. [1] is a payment-network governance item whose visible excerpt concerns an unrelated historical market episode (the NYSE in the Panic of 1907) and newsletter sign-up text; it contains no material on Base, on USDC transfer mechanics, or on finality. [2] is a classification framework for stablecoin designs; its excerpt discusses the choice of a consumer price index as a peg and the role of collateral in giving a circulating currency redemption value, and it does not address transfer finality on any network, Base included. [3] is a taxonomy of digital asset treasuries and onchain credit; the excerpt available here is limited
```

The report also appears **truncated mid-sentence** in the last two sections —
a symptom of the empty-section / assembly problem (item 2), not a rendering
issue.

## Verdict

The **plumbing** works end-to-end on live infrastructure: intake → plan →
approve → search/fetch/score → write → settle/refund, with the ledger and
report persisted. The **research quality** does not, on this run, and the
**shared testnet DB** is too unstable for a repeatable live run. Nothing here
is a mock; every number above is from real services.

## UX findings (browser e2e rounds, prod testnet)

Fixed during the campaign:

- **Plan() stranded users on configure.** The poll loop was 20×800ms with no
  timeout error — a slow replan left the configure screen silently dead.
  Now 90×2s with a loud timeout notice. (Round-2 e2e caught it.)
- **Failure notices hid the reason.** `drNibApi.req()` threw bare statuses,
  so cap-hits surfaced as "Could not reach Dr. Nib". Server error text is
  now appended (e.g. the live-run cap message with counts).

Open / suggested:

- **Back buttons say only "Back".** On review/configure, "Back to
  configure" / "Back to questions" would orient. Cheap copy fix.
- **Disabled Approve under escrow opt-in has no inline reason on the
  button.** The escrow box above explains, but a `title`/hint on the
  disabled button itself would close the loop.
- **Negative run balances observed** (e.g. spent 0.27 on $2 cap showing
  −0.128). Looks like a settle/refund arithmetic wart, not just float
  dust. Needs a ledger audit before mainnet spend grows.
- **`POST /v1/runs/:id/end` on `intake-done` runs 404s** ("project not
  found"). Ending should work from every non-terminal state, or the
  404 should say which states are endable.
- **Live-run cap (3) fills with real-titled debris during testing.**
  The suite self-cleans e2e-titled runs only. For campaign velocity we
  end stale runs by hand; a `DRNIB_E2E_CLEAN=1` pre-suite sweep would
  automate it.

## Open backend warts (found hammering prod testnet 2026-10-09, all need a fresh-eyes pass)

- **Intermittent creation 500 via the frontend proxy** (`POST
  /drnib-api/v1/runs` → `500 {"error":"Expected property name or '}' in
  JSON at position 1 (line 1 column 2)"}`), while direct-to-service calls
  behave (201 or clean 429). The run row IS created server-side, so the UI
  sits on the composer while a zombie row piles into the live-run cap.
  Local creation never reproduces it. Suspect: body mangling somewhere in
  the Vercel rewrite path — needs a proxied-vs-direct differential with
  request logging, not more guessing.
- **Un-endable, un-deletable runs.** `0289bbb4` and `468ea0b2` return 404
  "project not found" on GET/end/DELETE yet appear in list-runs for the
  same wallet. They squat the live-run cap until the 72h stale rule ages
  them out. Theories exhausted (ownership, soft-delete, idempotency
  replay); needs DB-level inspection of those rows.
- **Negative run balances** (e.g. spent 0.27 on a $2 cap showing −0.128).
  Beyond float dust — settle/refund arithmetic needs an audit before
  mainnet spend grows.
- **Provider failures are invisible.** SearXNG misconfig (json disabled)
  and ENOTFOUND-class errors never surface in events, logs, or the UI —
  runs just come back thin. The search-step `providers` array exists in
  step output; it should be logged server-side and shown in the run UI.

- **OpenRouter credits are empty (2026-10-09).** The prod-testnet full run
  parked at its first JEV gate (`paused`/`jev`, step `midrun-ask`) with
  `JEV /api/hub/jev/decide HTTP 502 ... HTTP 402: Insufficient credits`.
  The hub's OpenRouter account (not the local dr-nib key) needs a top-up at
  `https://openrouter.ai/settings/credits`. Parked runs are resumable
  (`POST /v1/runs/:id/resume`); the e2e poll loop now resumes `paused` runs
  instead of timing out on them.

- Stand up SearXNG locally (or set `SEARXNG_URL`) and re-run — retrieval is
  the difference between the report above and a useful one.
- Add per-section writer retry/fallback so an empty model response degrades a
  section, never the report.
- Prefer a local Postgres for live runs; keep the retry hardening as defence.
- Re-run the browser suite (now park-aware) to a green report + a real export
  click, once the DB is stable.
- Gate 1 (vendor wallet policy) is deliberately out of scope — no Arc vendor.
