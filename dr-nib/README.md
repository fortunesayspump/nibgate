# Dr. Nib, PhD (agent interface) — pre-build scope

Status: design only. No code, no commits, no pushes until the hackathon window.
Part of the Tameion trio (`tipping/` = protocol, `extension/` = humans,
`dr-nib/` = agents). See `../tameionhack.md` for the full plan.

## What it is

A research agent with a **user-funded USDC budget** that autonomously acquires
information that costs money. Not "ChatGPT with payments" — the fundamental
capability is **spending a budget on information, justifiably**.

## The loop

1. Budget in (user deposits USDC into the agent wallet — Circle Wallets).
2. Plan from the research objective.
3. Search Nibgate index + web → candidate sources.
4. LLM proposes actions per source: buy / tip / skip / cross-check / stop.
5. **JEV decides** under budget, relevance, uniqueness, reputation, confidence.
6. Nibgate-locked → unlock; external + justified → tip; redundant → skip.
7. Synthesize the cited report (PDF export stretch).
8. Every spend lands in a visible **decision trace** (append-only, replayable).

## Money rules

- Tipping is NOT mandatory per source. Dr. Nib pays only when JEV judges the
  acquisition justified — economic agency, not auto-pay.
- JEV can `escalate` (low confidence / over threshold → human).
- Budget accounting is exact: allocated, spent, remaining, per-source costs
  on the closing screen.
- Testnet only for the event. Real balances, fake money.

## Identity

Registered on **ERC-8004** (Arc) as a payment-capable agent identity
(verify registry availability in prep; cut if absent). Pitch: on-chain
identity + Nibgate payments + JEV decisions.

## State (dedicated Postgres — never hub tables)

Agent state is append-heavy, session-scoped, and money-adjacent. It lives in
its own database; hub content is referenced by ID, never joined.

| Table | What | Lifecycle |
|---|---|---|
| `sessions` | research goal, budget allocated, status | one row per chat session |
| `messages` | user + agent turns (full transcript) | append-only per session |
| `budget_ledger` | every deposit, hold, spend, refund with tx refs | append-only, auditable, never updated in place |
| `decisions` | JEV decision records per step (options, scores, reasons) | append-only; powers the trace UI |
| `sources` | acquired sources: URL, content hash, cost, access path, citation | per session; deduped by hash |
| `memory` | distilled facts across sessions (user prefs, trusted sources) | compacted, user-scoped; embeddings only if semantic recall earns it |

Money rule: the ledger is the source of truth for "what did the agent spend,"
reconciled against on-chain balances. No negative balances, no edits.

## Modes

One mode: research with budget. No thin GPT-wrapper mode — focus.

## Build order

Chat UI on hub → budget + wallet → source search → JEV spend loop →
synthesis + citations → decision trace UI → PDF (stretch) → ERC-8004 (stretch).
Consumes `tipping/` API + `jev/` core; builds nothing it can borrow.
