# Dr. Nib — live end-to-end test record

## 2026-10-15 — Arc mainnet funded browser run

- The signed-in owner funded the synthetic expense-ledger run `3d7ea349-1510-43d4-a2d8-2dc4fc598f62` with 0.50 USDC and approved execution. It completed using the private uploaded CSV as its sole source. The agent identified a candidate 89.00 USD duplicate, reconciled 1,141.00 USD raw spend to 1,052.00 USD adjusted spend, and wrote a cited report with category totals, three operational actions, uncertainty, and a stopping rule. Its JEV round call selected `write` (0.53 versus 0.47 `continue`) after one review round. The sampled claim check marked 6/6 supported; this is not a sentence-by-sentence or independent accounting audit.
- Escrow job 1 completed on Arc mainnet. The [core completion transaction](https://explorer.arc.io/tx/0x4a65ae175a3c7565037b9ffa49c42ec6e8ac565315e938cd75f514e4933cea93) succeeded and transferred the 0.50 USDC escrow to the splitter. The [split transaction](https://explorer.arc.io/tx/0x4121d0fa4700a8a3831a6249d006a8a904fdaef76e0833ac140d177cd63c9866) succeeded, distributing 0.088854 USDC to the operator, 0.000897 USDC to treasury, and 0.410249 USDC back to the owner's wallet. The receipt rounds these to 0.09 spent (platform share included) and 0.41 refunded.
- The report distinguishes a duplicate ledger entry from a proven double bank debit and calls for a statement or processor record before seeking a refund. It does not prove general business-research quality, paid-source selection, or creator tipping: this synthetic source-only run disabled external retrieval and tips. Live QA exposed misleading no-evidence fetch text and an abstract that called a complete section truncated because its prompt saw only the first 8,000 characters. Commit `339f8e7` fixes both for future runs; 22 focused writer/pipeline tests passed. The existing report remains an immutable record of the run.

## 2026-10-15 — mainnet browser planning and model-key repair

- The signed-in mainnet browser created run `3d7ea349-1510-43d4-a2d8-2dc4fc598f62` from a synthetic small-business expense brief, answered eight contextual intake questions, and attached a synthetic CSV. The source reached `Ready` with 1,511 extracted characters in private R2 storage. The connected wallet showed 0 USDC, so the browser run was not funded or executed.
- The first plan contained generic “angle 1/2” steps. Its saved worker stage recorded `source: fallback` and OpenRouter HTTP 401 (`User not found`). The mainnet worker had a rejected key while the API key was valid. Its Railway model key and model-selection variables were changed to reference the API service. Replanning the same run then produced ledger-specific duplicate-charge/category-total and savings/stop-rule steps. This verifies live planning after the repair, not report quality or settlement.
- The planner now persists `plan.source`. A fallback plan is labeled in the browser and rejected by approval and escrow opening/registration routes; a user can reconfigure and replan without a deposit. The Dr. Nib MCP approval tool applies the same gate. At this checkpoint, funded execution and settlement were unverified; the later run above verified them.

## 2026-10-15 — Arc mainnet escrow deployment

- Deployed stock ERC-8183 core `0xF08bB50BC833C7Bff25b60Fe1456f1235A0a4037` (tx `0xa3d9fa4f6dc78207826f167dd5ec7da992021af0d0215f75daf95e61ae50a914`) and `NibgateRunSplitter` `0x68A1E5797A4D661308A51Aa54010aDEA73aa36D3` (tx `0xa90286744ae9386e787624f4fda3ebeacec194b16426483a87ea820178cd1272`). Independent Arc RPC receipt reads returned `success` and nonempty bytecode for both. The deployment script verified USDC, core, keeper, treasury, and 100 bps fee constructor values onchain. All seven splitter Forge tests passed before deployment.
- The mainnet keeper was topped up from the Nibgate deployer to 0.107934559 native USDC (tx `0x18eb1d1964b9639c306cb920be33617eec83972b4e2ff271a08d0a760e2cc9c1`). The mainnet API and worker were wired with the recorded core/splitter, Railway keeper-key reference, and operator `0x7BDfE66e91bd1A502DD1Cb8Bd9417e1066c4c365`. The API's rendered key derived the contract's keeper address. Both direct `https://drnib.nibgate.xyz/health` and proxied `https://nibgate.xyz/drnib-api/health` returned `acceptingRuns: true`, `escrowReady: true`; the mainnet browser composer replaced its preview notice.
- This deployment check alone did not prove a mainnet user-funded lifecycle; the later run above verified deposit, report settlement, and refund. External escrow review, wallet-button soak, and reject/refund route parity remain open.

## 2026-10-15 — multi-round research and MCP release check

- An Arc Testnet QA run for a real Nibgate business question (Arc vs Base for a creator-tip pilot) exposed two release failures. Run `b9da69c6-409d-4acd-9d2b-340e137998c3` (escrow job 32) parked after the source scorer exceeded the hub's 30-JEV-requests/minute limit. After source trust and quality checks were batched, it resumed and finished three research rounds, but the one-shot short-report model call failed. It settled without a report: $0.236549992 spent and $1.763450008 refunded from $2 test USDC. No placeholder was delivered.
- The source scorer now sends up to four sources in a single JEV batch while retaining each trust and quality decision in the activity record. Short reports bound excerpt length, retry empty/failed model responses up to three times, and record a concrete writer failure reason. Focused JEV (8), MCP (7), writer/provider (36), and full worker-pipeline (9) tests passed. The documentation production build passed for the decision-focused wording.
- Fresh run `e06bd4e8-95f0-4778-972d-07bc307a7b61` (escrow job 33) completed on deployed testnet. The plan estimate was $1.16 under a $2 funded cap. It searched, fetched, scored and reviewed three rounds; JEV chose `continue` twice (0.98 and 0.95 probabilities), then the configured standard-depth cap forced writing. The 1,463-word cited report recommends Arc conditionally for self-funded tippers, marks published Arc/Base fee figures as not like-for-like, and identifies unmeasured fee and wallet-integration gaps. Sampled verification marked 11 of 12 claims supported and one unknown; it did not verify every sentence. The run spent $0.289826734, refunded $1.710173266, and completed onchain with split tx `0x6dd91ea2d585dd1d67f3351389e3c3e1ccdb6226bfac1c83f96068e7251eeae0` and complete tx `0xffcb2c95204d14e79a7167fa96f7f1eea8ef96bf031835196394628729e25ddf`.
- No priced source appeared in the retrieved set, so this run did not exercise a real paid-source proposal or purchase. It proves two JEV continue choices and an enforced depth stop, not an autonomous JEV write choice. It is QA activity, not traction or a human-scored comparison against other research products.
- The signed-in browser view of a prior user-owned run displayed queries, source judgments, a round verdict, the reason direct calls were skipped, report discussion with rendered Markdown, and an escrow receipt. The QA wallet run belongs to a separate account and was inspected through its owner-authenticated API. Both deployed Dr. Nib MCP 0.2.4 cards returned 200, unauthenticated `tools/list` returned 401, and mainnet still reported `acceptingRuns: false` because mainnet escrow/keeper readiness and external escrow review remain outstanding.

## 2026-10-14 — document inputs and lifecycle release checks

- Full backend suite: **325 tests passed across 41 files**, on disposable local PostgreSQL. Providers and chain writes are mocked in these regression tests; they do not establish live paid-tool or mainnet behavior.
- Worker integration checks cover free planning, changed-configuration replanning, pause/resume during search and writing, End during an active stage, duplicate queue delivery, unavailable-JEV recovery, failed generation/refund, and source-only execution. Ledger tests cover concurrent draws/refunds, settled-money reuse rejection, checkpoint charge replay, and alternate-route escrow top-up refusal.
- Upload checks exercise real PDF, DOCX, XLSX and CSV extraction, decimal currency totals, duplicate-row warnings, bounded sheet ranges, file limits, owner-only previews/downloads and source freezing. Public reading rejects private network destinations. Optional tips require owner opt-in and high-trust sources cited in the report body.
- Frontend TypeScript check and documentation production build passed. Report discussion now uses the same Markdown/citation rendering as report content. Private report links are labeled as account links. New exports return authenticated bytes instead of publishing research to the public media bucket.
- Live R2: one private bucket, **`nibgate-research`**. Cloudflare confirms managed public access disabled and no custom domains. Synthetic write/read/delete checks passed with rendered Railway variables for testnet API, mainnet API and mainnet worker, using `testnet/` and `mainnet/` paths. No customer records were used.
- Live browser validation of this release is recorded below after deployment. Do not treat the regression suite as proof that every possible scenario or payment rail was exercised.

### Research quality and release boundaries

The comparison rubric uses editable plans, supplied documents, steering, cited findings, export usability and evidence limitations, consistent with [OpenAI deep research](https://help.openai.com/en/articles/10500283-deep-research), [Anthropic Research](https://www.anthropic.com/news/research) and [agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). These are evaluation dimensions, not a claim of equivalent performance.

Business-record analysis is assisted research: document references, explicit currency-separated decimal sums, duplicate flags and limited-evidence notices. It is not a financial audit, reconciliation or guarantee of exhaustive row-level verification. Uploaded extracted text goes to configured AI providers. PNG, JPEG and WebP now use local English-text OCR; image-only charts, handwriting, table structure and scanned PDFs are not reliably interpreted. Public report sharing is not implemented. A fresh run copies the topic and requires files to be added again. Mainnet escrow is live and its funded lifecycle is verified above; independent escrow review remains open.

### 2026-10-14 follow-up live checks

- Testnet Google-wallet browser flow: sign-in, Arc RPC reachability, gas and USDC balances, and the enabled escrow button were observed after the wallet RPC fix. The user's wallet was not used for a payment.
- Testnet browser source flow: a synthetic PNG uploaded to the private bucket, produced a readable OCR preview and warning, invalidated the old plan, and returned the project to Configure. Removing that disposable image returned the source count to one. After the configuration fix deployed, reloading the project restored quick depth, the $1 cap, source-only mode and a custom 600-word target.
- Independent testnet API smoke: a synthetic image upload returned OCR text and the exact original bytes to its owner; an unauthenticated original request returned 401.
- Independent funded Arc Testnet run `726bb0da-f728-495a-a4e0-8b9230a4734b` used a synthetic expense CSV and a separate QA wallet. Escrow job 31 completed, spending $0.028886292 of a $1 test deposit and refunding $0.971113708. The sampled report gave the expected currency-separated totals, date range, category shares and duplicate caveat.
- These checks do not establish that every UI control, export, failure recovery path, paid source-tip decision or mainnet transaction works end to end. The regression suite mocks providers and chain writes in many cases. No independent comparative quality benchmark against other research products has been completed.
- Follow-up verification change: claim extraction now walks report sections and samples claims across them instead of reading only the first 12,000 characters. Focused tests cover the report tail, spread sampling, duplicate claims and the very-long-report cap. This is a code-level check; a fresh live funded run with a long report is still required to prove the deployed behavior and judge its quality.

### Prior live testnet evidence

Funded browser runs `911e6990-32a7-41bb-b145-13dcd0cf2fd2` (escrow 28) and `b7dd733c-bd68-4899-ba17-1ef63f3923bd` (escrow 29) completed with automatic onchain split/refunds. Run 29 spent approximately $0.16 from a $1 test deposit and refunded approximately $0.84. Its sampled verification was 5/6 supported claims. Its Arc/Base cost comparison needed a like-for-like caveat; the report prompt now explicitly requires matching workloads/units/assumptions. All seven exports from run 28 downloaded and their packages were checked; run 29's two-page PDF was visually checked. These historical runs precede this release's source-upload changes.

The following entries are historical test records.

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

**Round 3 (browser journey) green.** Rich intake (sample chip, Enter
submit, option-button answer, Back both ways), full configure matrix
(live-web, escrow opt-in surfaced at Review, pdf/excel toggles, length
radios, Back-replan loop), detail actions (breadcrumb, expanders,
guidance, reprompt, real md download), all on `testnet.nibgate.xyz`.
Fixed en route: vague `Back` labels, plan() silent dead-end, error text
swallowed, breadcrumb selector, per-click timeouts.

**Rounds 4–5 green.** Batch answering (per-card drafts, Next loop),
custom length, answered-transcript Back view, project delete/restore
cycle ($0). Fixed en route: Playwright `has:`-with-scoped-locator
silently matches nothing (use per-card count()), batch Submit gating,
duplicate probe titles, answered-transcript blank screen (product fix),
deploy-churn reload guard.

**Round 6 green (all seven export downloads).** Attaches to a completed
run ($0): md/json/bibtex/pdf/word/excel/powerpoint all fire real
downloads, not just visible buttons.

**Round 7 green (run controls).** End button (two-tap), raise-cap
inline, report version selector across reprompt versions ($0).

**Decision-trail audit (latest complete run).** JEV `jev-1.13` deciding
throughout on the funded key: midrun-ask 0.93/0.07 with a real scoping
question, source-trust calibrated low (0.09–0.14) on thin academic
sources, source-grades spread (not degenerate). The machinery judges
honestly; recall (finding numbers/docs) is the remaining quality gap,
not judgment.

**Round 2 (browser journey) green.** Rich intake (sample chip, Enter
submit, option-button answer, Back both ways), full configure matrix
(live-web, escrow opt-in surfaced at Review, pdf/excel toggles, length
radios, Back-replan loop), detail actions (breadcrumb, expanders,
guidance, reprompt, real md download), all on `testnet.nibgate.xyz`.
Fixed en route: vague `Back` labels, plan() silent dead-end, error text
swallowed, breadcrumb selector, per-click timeouts.

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
- Sources scored: 5. Claims: 0 (verify pass was not wired yet — it is now, and
  estimates include its $0.03 stage). Report: v1, 6,583 chars.
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
  disabled button itself would close the loop. (Approve already carries
  one — verified in review UI.)
- **Answered-transcript blank screen.** Back-to-questions with a fully
  answered intake rendered header + void (no transcript, no message).
  Fixed: "All answered" transcript + Continue; plus an empty-state with
  Reload. Caught by round-4 e2e.
- **Negative run balances observed** (e.g. spent 0.27 on $2 cap showing
  −0.128). Explained, not a wart: `money.js` documents that `balance`
  (deposited − used − refunded) goes negative when a settled run is revised
  and spends again — the refund already left but the cap still authorizes.
  Gates use `spendable(cap, used)`, never `balance`. Keep the explanation
  next to any UI that shows a negative number.
- **`POST /v1/runs/:id/end` on `intake-done` runs 404s** ("project not
  found"). Ending should work from every non-terminal state, or the
  404 should say which states are endable.
- **Live-run cap (3) fills with real-titled debris during testing.**
  The suite self-cleans e2e-titled runs only. Sweeps now run per-test
  (verifying clear); a `DRNIB_E2E_CLEAN=1` flag was considered but per-test
  sweeps proved enough.

## Missing UI (confirmed absent — feature decisions, not bugs)

Built this round: end-run button (two-tap, all active states), raise-cap
inline on the budget bar (existing topup endpoint), report version
selector (added backend `?version=`). All e2e'd in round 7.

Still open: objectives editing (no such entity — needs design: which
brief fields are editable post-hoc and what it invalidates), escrow full
onchain fund flow e2e (needs connected browser wallet + funded key
choreography; presence asserted at Review only).

## Open backend warts (found hammering prod testnet 2026-10-09, all need a fresh-eyes pass)

- **Intermittent creation 500 via the frontend proxy** (`POST
  /drnib-api/v1/runs` → `500 {"error":"Expected property name or '}' in
  JSON at position 1"}`). Rare (3–4 sightings in a night of hammering),
  never in browser traces, never reproduced on demand (3/3 clean 201s
  minutes later), never local or direct-to-service. The run row IS
  created server-side, so the UI strands on composer while a zombie piles
  into the cap. Prime suspect remains body mangling in the Vercel rewrite
  path. Mitigations shipped meanwhile: server-side stack log on creation
  failure, sticky actionable notices, cap link to Projects.
- **Un-endable runs.** One ghost row (`0289bbb4`, intake-done, $0):
  listed for the wallet with a verified-complete ID yet 404 on
  GET/end/DELETE. (An earlier batch of 404s turned out to be truncated
  IDs in my own tooling — always use full IDs from a compact list.)
  Needs DB-level inspection of that row.
- **Negative run balances** (e.g. spent 0.27 on a $2 cap showing −0.128).
  Beyond float dust — settle/refund arithmetic needs an audit before
  mainnet spend grows.
- **Provider failures are visible.** SearXNG misconfig and ENOTFOUND-class
  errors surface per-provider in the search step output, in the run UI
  step detail (failed providers named with errors), and in the chat
  transcript (`via:` line). Runs still come back thin when providers fail —
  that is honest reporting, not invisibility.

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

## Owner live run 2026-10-10 (prod testnet) — findings + fixes

One real run, watched click by click ("which creator paywall models convert
best in 2026"). Every complaint below is verified against code;
each ships with the e2e gap that let it through, because the suite answered
whatever it was given and never checked quality.

1. **Intake asked hardcoded bank questions, not LLM ones.** Root cause:
   `smartModel()` defaults to `typesafe/jev-router`, a decisions router, and
   sends it with the `models` fallback array — OpenRouter 400s the whole
   request: "The decisions router cannot be combined with another router
   model" (reproduced locally in 2.7s). Every smart call (intake batch,
   plan, round review) failed; bank filled in silently. Fix: smart default
   follows `routerModel()`; intake fallback reasons are logged server-side.
   E2E gap: full run asserted completion, never question `source`.
2. **Plan was fallback too ("(angle 1)" queries → junk hits).** Same root
   cause as 1: `fallbackQuestions()` emits "What does the evidence say
   about: \<topic\> (angle 1/2)", and `keywordQuery` fed that raw to
   providers ("2018 in American television" hits). Fixed by 1.
3. **Thinking screen clears per message.** `streamThinkings()` gives each
   thinking full-screen time, wiping the last. Fix: appended history, each
   streams in below the previous; active steps get a shimmer/pulse affordance
   (opencode/Claude/ChatGPT-style), not just a dot.
4. **Empty answers in the transcript ("You: (empty answer)").** Answer
   endpoints accept `{}`; unanswered-vs-skipped is indistinguishable downstream
   and `think()` writes reads about nothing. Fix: 400 empty answers on all
   three answer endpoints unless explicit skip; unanswered renders "Skipped".
5. **Review shows plan takes, not the answered Q&A.** The configure/review
   screen surfaces plan attempts; the answered transcript is what the owner
   needs to audit before approving. Fix: review leads with the answered
   transcript.
6. **Mid-run fork question names no branches.** `maybeAsk` parks with a
   hardcoded `free`-text "Narrow me to one branch" — the two branches are
   never stated. Fix: LLM drafts the fork as `pick_one` with the actual
   disagreeing claims as options (+ Other exit).
7. **`free` question type removed.** Only `pick_one` / `pick_any` may be
   asked (prompts forbid `free`, validator rejects it, bank `exclude`
   converted). `allowOther` stays the nuance exit.
8. **Approve runs with no wallet signature.** Runs spend from the
   keeper-funded agent wallet; testnet never asks the owner to sign.
   Fix (min): review states plainly who pays and why no signature appears.
9. **Score crashed: `researchEvent` P2002 (`runId`,`seq`).** The new parallel
   trust/grade made concurrent `recordEvent` collide on read-max-then-insert.
   Fix: P2002 retry loop with jitter in `recordEvent` + a concurrent-writers
   unit test (the e2e passed twice by timing luck).
10. **429s from semanticscholar/gdelt.** Upstream keyless rate limits under
    parallel fan-out, not our timeouts — verified zero `timed out` errors in
    the measured run, so the 20s→10s cut dropped nothing. Watch item, not a fix.
## Deposit model live 2026-10-10 (prod testnet) — verified fund → run → refund

Approve now requires a Funded onchain escrow where configured and books the
ledger from the verified budget; settle completes the job onchain
(submit + complete + split attestation) automatically. E2E run `64b973b4`:
job 11 funded $2 (keeper), approved, completed, `escrow.completed`
`0xc041d2…` — remainder enforceable by contract. `ESCROW_OPERATOR` on
testnet is the keeper (test loop closed); mainnet needs a real operator
before escrow configures there. UI suite re-runs once Vercel's 100/day
window resets (frontend carries the review gate + rendered report).

## Chat-first run visibility (unpushed, local)

JEV probed healthy on prod (`64b973b4`: intake-stop ask_more 0.99→proceed,
midrun-ask 0.96, per-source trust + grade distributions, all
`typesafe/jev-1.13`) — but judgements never reached the chat. Now they do:
- **Decision rows**: every JEV call renders with pick + probabilities +
  model + cost and a prompt+output expander; round reviews show
  learnings/follow-ups.
- **Stage narration**: one LLM-voiced line per finished stage (found +
  next), fire-and-forget from `stage()` — `generateStageNote`, never
  blocking, `thinking` events with `phase: stage-<kind>`.
- **Live writing tokens**: write-stage deltas stream over SSE
  (`type: token`, batched 250ms, per-section streams) into a "Writing now"
  preview; ephemeral, the persisted report stays the record.
- **Feed motion**: theme-aware fade (`--nib-surface`, no hardcoded white),
  slide-in only for unseen items, shimmer + caret on live text.
- **Report article page** (`research/[id]/report`): full prose, no clamp,
  sources with thumbnails; `[n]`/`[1, 2]` chips link straight to the cited
  source URL (trust-ranked order matches the writer's numbering).
- **Source images**: `og:image` captured at extract → fetch-step documents
  → thumbnails (no migration, joined by URL at render).
- **Gratitude stage**: opt-in `tipCreators` at configure → post-score agent
  loop tips decisive creator pages (model proposes, JEV judges, $1/call +
  balance gates). Agent wallet holds ~19.27 USDC testnet; previously
  unreachable (dataStage skips when retrieval suffices).
- **Export chat**: full transcript download (Q&A, reads, judgements with
  costs, steps, tools, sources) from the activity header.

## Partial-escrow + UX pass live 2026-10-11 (local stack, testnet USDC)

- **Fund ≥ estimate, not the full cap** (job 17): $0.20 funded (= estimate on
  a $2 cap) → approve 200 with working cap aligned to $0.20 → spent $0.158 →
  paused at cap → second fund reverted onchain (one-shot) → raise/resume
  refused with explicit errors → end → ledger refund $0.0399 → job Completed
  with split attestation. Funding floor, pause-on-empty, no-top-up, and
  settle all proven with real money.
- **Verify wired**: was dead (wrong import + never called); now runs after
  every write, claims cleared per report, +$0.03 in estimates. Live probe on
  a completed run: 4 claims, 2 supported / 2 unknown, $0.0007.
- **OpenRouter web_search provider**: model-picked queries, Exa engine,
  annotation-only results, ~$0.007 + tokens, circuit-broken. Live probe
  returned real page URLs (native engine gave redirect URLs — forced Exa).
- **UI**: settlement receipt, coverage badge + claim×source matrix (browser-
  proven), version-pinned share links, version steer display, deterministic
  report Q&A, duplicate runs, feed timestamps + jump-to-latest, copy buttons,
  single-row autogrow composers, intake/configure resume + auto-resume,
  load-failure banners/skeletons/retry, escrow amount selector, 429 handling,
  projects focus-refresh, Settings→Help, agent self-model (+cap/estimate/
  elapsed/status).
- **E2E repairs**: UI spec syntax error (comment fused into a function);
  round-4 Next-clicks fired during the batch POST — now waits for settle text.
  API 5/5 + UI rounds 4–7 green locally.
