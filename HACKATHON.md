# TAMEION HACKATHON — BUILD RULES (read before touching hackathon code)

> **SUPERSEDED (Sep 29):** the Sep-30 push freeze below was lifted by direct
> instruction — tipping, refunds, factories, SDK, hub, and mainnet deploys all
> shipped to `main`/production before the window closed. Kept as the event
> plan of record; do not follow the freeze rule. Event: Tameion Agents
> Hackathon, Sep 27 – Oct 10 (Canteen × Circle, on Arc).
Judging weights agency 30% + traction 30%, and judges the DELTA during the
window — product shipped + businesses reached Sep 27–Oct 10. Work that lands
before the window does not count.

## The rule

- All hackathon work stays in LOCAL branches (`hack/<feature>`) branched from
  `main`. Nothing hackathon-related is pushed to origin.
- **DO NOT `git push` hackathon work before September 30.** Pushing also
  auto-deploys Railway + Vercel, so a push is a public launch — treat it as one.
- Exception: critical production fixes may go straight to `main` (no features
  smuggled in).
- From Sep 30: push early and often (judges explicitly reward it, resubmits allowed).

## What we're building (testnet only for the event; mainnet launches after)

1. **Tipping API** — any URL on the internet tippable via the hub API
   (testnet: `testnet-api`, chain `eip155:5042002`). Higher protocol cut for
   non-Nibgate creators. Unclaimed tips accrue per-domain, released on
   site verification. SDK + nibshare + subblogs surfaces. Verification mints
   the creator an agent-managed wallet (Circle Wallets).
2. **Tip extension** — humans: auto-discovers content on the open page, injects
   tip UI, pays over Gateway/direct rails. Bots/agents use the skill.md API
   route (no extension needed).
3. **Dr. Nib, PhD** — research agent on the hub (chat UI). Budget in → sources
   found → nibgate-locked content unlocked, external content tipped → cited
   research doc/PDF out. Registered on ERC-8004 (Arc). Every spend decision
   logged with reasons (append-only decision record).
4. **JEV** — the decision layer under all of it: LLM proposes questions and
   choices, JEV decides under budget/confidence/policy rules, deterministically
   and explainably. Powers metadata autofill, extension content-ID, research +
   hub ranking, and Dr. Nib's spend choices. Pure logic, money-agnostic.

## Local readiness checklist (before Sep 27)

- [ ] `main` green locally: hub :3000, frontend :3001, subblogs :4000/:3002
- [ ] Testnet envs verified against `testnet-api` + `testnet-api-subblogs`
- [ ] `hack/tipping-api`, `hack/extension`, `hack/dr-nib`, `hack/jev` branches cut, unpushed
- [ ] ERC-8004 registry addresses confirmed on Arc testnet (+ mainnet if live)
- [ ] Circle Wallets + Gateway test-USDC flow rehearsed end-to-end on testnet
