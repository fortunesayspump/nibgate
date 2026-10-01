# Dr. Nib — UX flow

*How a run starts, what the user sees, and when money moves.
Researched Sep 2026 (onboarding, progressive disclosure, usage-pricing UX).*

## The flow (happy path)

```
Home (Research)                New + Active projects as cards
  │  [+ New run]
  ▼
Chat input                     "What should Dr. Nib research?"
  │  user types a question
  ▼
AI questions                   2–3 clarifying questions, one at a time,
                               conversational (not a form dump)
  │  user answers in chat
  ▼
Configure                      depth · sources · output format · budget cap
                               (sensible defaults pre-filled from answers)
  │
  ▼
Plan (FREE)                    JEV builds the step plan + cost estimate.
                               User reviews, edits, approves.
  │  [Approve & run]
  ▼
Deposit                        fund/top-up the run budget (USDC, x402).
                               Only now does money move.
  │
  ▼
Run                            activity feed, live cost ticker, pause/resume.
                               Pause on 80/95/100% → top up → resume.
  ▼
Report                         cited doc + sources + exports + receipt
```

## Why this order (research-backed)

1. **Cards first.** Home shows New + Active projects as cards (like
   content cards) so returning users resume in one click and new users
   see what "done" looks like. Recent-jobs lists prevent duplicate runs
   and lost work.
2. **Chat for intake, not forms.** Conversational onboarding (one
   question at a time, progress shown, summary card at the end) beats
   static forms on completion. The AI explains *why* each answer matters
   (scope, depth, cost).
3. **Progressive disclosure.** Brief → questions → configure → plan →
   pay. Each step reveals only what the last step earned. Never show
   budget fields before the user understands what they're buying.
4. **Plan before deposit (the key call).** Planning and estimating are
   cheap; execution is expensive. Industry pattern (quote wizards,
   effort dials with price ladders): intake → estimate → accept →
   deposit. The user approves a priced plan, *then* funds it. This also
   answers "when does the AI start spending" with zero ambiguity.
5. **Charge for outcomes, not learning.** Chat intake, questions, and
   the plan itself are free/cheap — they're how the user learns the
   product. Money moves once, at Approve, for the run. Caps are
   customer-set (budget cap field), alerts fire before limits, and runs
   pause instead of overspending. No bill shock, ever.
6. **Legible unit.** Bills read in *runs and reports*, never tokens.
   Cost-per-supported-claim is the internal unit; the user sees
   "$0.42 of $2.50" with a progress bar.

## Sidebar tabs (every tab earns its place)

| Tab | Job |
|---|---|
| Research | Home: New + Active project cards; the flow above lives here |
| Chat | Quick Q&A + interrogating results ("why trust source 4?"); one-click promote to a full run |
| Runs | History with states (queued/running/paused/complete/failed); retry creates a new run, originals stay immutable |
| Sources | Library collected across runs/chats; trust chips; click-through to claims |
| Budget | Balance, per-run meters, top-up, provider (Hub / BYO), spend history |

## States that must exist (no dead ends)

- Empty (samples + "what you get"), drafting, planned (estimate shown),
  awaiting funds, running (live steps + ticker), paused (reason + resume),
  complete (summary of what changed), failed (what/why/next + retry).
- Stale detection: "updated Xs ago" + refresh, never a frozen spinner.
- Cancel = "stop after this step"; partial results kept and labeled.

## Open (for discussion, not decided)

- First-run free credit (e.g., one Quick run) vs pay-from-run-one.
- Whether Chat answers spend budget per message or draw a small
  per-message meter with its own mini-cap.
- Recurring/scheduled runs (weekly briefs) — later, not v1.
