# JEV — decision layer (pre-build scope)

Status: building locally, testnet only. No commits, no pushes until the
hackathon window. Part of the Tameion trio's shared core — see
`../tameionhack.md`. Consumers: `../tipping/` (spend/hold), `../extension/`
(content-ID/amounts), `../dr-nib/` (research actions), hub ranking.

## Rule

LLMs propose possibilities. JEV makes constrained decisions between those
possibilities. **No LLM inside JEV** — pure deterministic functions over
scored options, so every decision is testable, replayable, and explainable.

## Layout

```text
jev/
  package.json / tsconfig.json
  src/schema.ts    # Option, Policy, Decision, Trace types
  src/decide.ts    # the engine: value scoring + policy gates
  src/trace.ts     # human-readable decision trace renderer
  src/propose.ts   # LLM proposer (Vercel AI Gateway free tier now, OpenRouter later)
  test/decide.test.ts / test/propose.test.ts
```

Run: `node --test test/` from here (Node 20+, no install needed).

## Producers: LLM propose is optional

JEV decides over scored options — **who scores them is the caller's choice**:

| Producer | When | Example |
|---|---|---|
| `propose()` (LLM) | open-ended judgment: relevance, uniqueness, quality | Dr. Nib source scoring, recipient inference |
| Deterministic rules | fixed choices: content types, thresholds, structural signals | `article` vs `video` vs `audio` from DOM tags; `structuralScores()` in `extension/src/content/dom-candidates.ts` |
| Hybrid | rules first, LLM only for ambiguity | DOM blocks scored by structure; LLM breaks ties below confidence |

`decide()`/`selectMany()` never know or care where scores came from. Rule:
if the choice set is fixed or the page structure speaks, **don't spend an
LLM call** — reserve the Vercel free tier (then OpenRouter keys) for genuinely
open judgments.

## Where JEV decides (full scope — not just Dr. Nib)

| Surface | LLM proposes | JEV decides | Shape |
|---|---|---|---|
| Dr. Nib research | actions per source | buy / tip / skip / cross-check / stop / escalate | `decide` per step, budget across steps |
| Nib Tip (unresolved creator) | recipient candidates | pay / hold / escalate | `decide` |
| Metadata autofill | tag/category candidates | top-k tags | `selectMany` |
| Extension content-ID | page signals | is-content / recipient / amount | `decide` + page markers (`extension/docs/MARKING.md`) |
| Hub ranking | relevance assessments | ordered slate | `selectMany` |
| Recommendations | candidate items | ordered slate | `selectMany` |

Single-winner spends use `decide()`; slates, tags, and rankings use
`selectMany()` (ordered picks + skipped + escalated, budget consumed
sequentially, ties by id).

## LLM providers

| | Now (hackathon) | Later |
|---|---|---|
| Provider | Vercel AI Gateway (free monthly credit, rate-limited subset) | OpenRouter (your keys) |
| Env | `AI_GATEWAY_API_KEY` | `OPENROUTER_API_KEY` |
| Select | `JEV_LLM_PROVIDER=vercel` (default) | `JEV_LLM_PROVIDER=openrouter` |
| Model override | `JEV_MODEL` | `JEV_MODEL` |

Both speak OpenAI-compatible chat JSON; switching is one env var, zero code
changes. The proposer only ever returns *scores* — JEV still makes every
decision.
