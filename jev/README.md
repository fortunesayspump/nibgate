# JEV — decision layer

Status: live on mainnet + testnet. Shared decision core for the trio (tipping
protocol, extension, Dr. Nib). Consumers: the wallet extension (recipient
inference,
settle-vs-hold, page classification), hub metadata enrichment, hub ranking.

## Rule

Deterministic JEV (`decide`/`selectMany`) makes constrained decisions between
possibilities and never touches the network — every engine decision is
testable, replayable, and explainable. The decisions model (`decisions.ts`,
TypeSafe's `~typesafe/jev-latest` on OpenRouter) only ever *scores or picks
from caller-supplied options*; it can never invent candidates, move funds, or
render UI. Callers own the threshold and always keep a safe default.

## Layout

```text
jev/
  package.json / tsconfig.json
  src/schema.ts     # Option, Policy, Decision, Trace types
  src/decide.ts     # the engine: value scoring + policy gates
  src/trace.ts      # human-readable decision trace renderer
  src/decisions.ts  # the real JEV decisions model client (OpenRouter /api/alpha/decisions)
  test/decide.test.ts / test/decisions.test.ts
```

Run: `npm test` from here (Node 20+, no install needed).

## Producers: where options come from

JEV decides over scored options — **who produces them is the caller's choice**:

| Producer | When | Example |
|---|---|---|
| Deterministic rules | fixed choices: content types, thresholds, structural signals | `article` vs `video` vs `audio` from DOM tags; `structuralScores()` in `extension/src/content/dom-candidates.ts` |
| JEV decisions model | open-ended judgment where the *model* picks the option | recipient inference on an ambiguous page (`chooseOption`) |
| Hybrid | rules first, model only for ambiguity | DOM blocks scored by structure; the decisions model breaks ties below confidence |

Rule: if the choice set is fixed or the page structure speaks, **don't spend a
model call** — reserve JEV for genuinely open judgments, and even then only
when local confidence is low.

## Where JEV decides (full scope — not just Dr. Nib)

| Surface | Producer | JEV decides | Shape |
|---|---|---|---|
| Dr. Nib research | actions per source | buy / tip / skip / cross-check / stop / escalate | `decide` per step, budget across steps |
| Nib Tip (unresolved creator) | recipient candidates | pay / hold / escalate | `chooseOption` → `decide` |
| Tip settle-vs-hold | declared wallet vs escrow | settle / hold | `choice` + 0.65 gate |
| Metadata autofill | tag/category candidates | top-k tags | `selectMany` + `askNoulBatch` |
| Extension content-ID | page signals | is-content / recipient / amount | `decide` + page markers (`extension/docs/MARKING.md`) |
| Hub ranking | relevance assessments | ordered slate | `selectMany` |
| Recommendations | candidate items | ordered slate | `selectMany` |

Single-winner spends use `decide()`; slates, tags, and rankings use
`selectMany()` (ordered picks + skipped + escalated, budget consumed
sequentially, ties by id).

## LLM provider

JEV uses TypeSafe's **decisions** models via OpenRouter — the real JEV model,
not a chat proxy.

| | |
|---|---|
| Model | `~typesafe/jev-latest` (aliases `typesafe/jev-1.13`) |
| Endpoint | `POST https://openrouter.ai/api/alpha/decisions` |
| Module | `src/decisions.ts` (`decisions`, `chooseOption`) |
| Env | `OPENROUTER_API_KEY`, `JEV_DECISIONS_MODEL`, `JEV_DECISIONS_URL` |

JEV *decisions* models are **not** chat models — calling one on `/chat/completions`
returns `is a decisions model and cannot be used with the chat/completions endpoint`.
Ask them structured questions over a `state` instead:

```jsonc
POST /api/alpha/decisions
{
  "model": "~typesafe/jev-latest",
  "state": "External coffee blog; byline 0xaaa, footer 0xbbb",
  "questions": {
    "recipient": {
      "type": "choice",              // choice | score | noul
      "instructions": "Choose the author wallet",
      "criteria": { "0xaaa": "author byline", "0xbbb": "footer link" }   // keys ARE the choices
    }
  }
}
// → { "answers": { "recipient": { "type":"choice", "choice":"0xaaa", "probabilities": {…}, "confidence": 1 } }, … }
```

`chooseOption()` wraps the `choice` shape: give it ids + descriptions, get back
the pick with calibrated confidence. `askNoul()` / `askNoulBatch()` wrap the
`noul` shape for calibrated 0..1 probabilities (page classification, tag
scoring). The model makes the constrained pick; callers still own the threshold
and any downstream `decide()` gates. Hub-proxied surfaces:

- `POST /hub/jev/decide` — choice over candidate ids (recipient inference)
- `POST /hub/jev/classify` — noul "is this creator content?" probability
- `POST /hub/jev/tags` — batch noul tag scoring (tentative discovery metadata)

The key never leaves the server.
