# Nibgate agent gates — canonical spec

Where the agent's money is enforceable, by whom, and what remains trust-me.

Reference: Aomi Labs, "Three Gates from Intent to Settlement" (Sep 2026).
Their taxonomy maps 1:1 onto our stack. This file records our coverage per
gate, the bypass analysis, and the build order for what is missing.

## Current coverage

| Gate | Mechanism | Administrator | Bypass route | Status |
|---|---|---|---|---|
| 0.5 Runtime construction | loop: schema, caps, JEV verdicts, dedupe, budgets, checklist | Nibgate backend (us) | operator code change | ENFORCED (app boundary) |
| 0.5 Simulation | `previewPrice` reads the 402 free; cap hook aborts over-ceiling at signing | backend | seller serves no price → we refuse blind | ENFORCED |
| 0.5 Verdict binding | judgement rows staple canonical `fp`; re-checked pre-execution (`verdict-void`) | backend | none in-process | ENFORCED |
| 0.5 Injected state | `crossCheckRpc` primary-vs-backup before every spend | backend, active only with `DRNIB_RPC_BACKUP` | single-RPC deploys skip it | PARTIAL |
| 1 Wallet policy | — | — | any backend compromise signs freely | **MISSING** |
| 2 Escrow mandate | `NibgateRunSplitter` (keeper/treasury/splits onchain) | contract, keeper key | keeper key compromise | ENFORCED (testnet) |
| 2 Spend mandate (agent wallet) | — | — | `$1 cap` is JavaScript; onchain the key is unlimited | **MISSING** |
| 3 Builder | — | Arc sequencer (not ours) | out of scope | NONE |

Procedural boundary in force until Gate 1 lands: the agent hot wallet holds
only operating float (~$20 testnet). Balance discipline, not cryptography.

## What Aomi itself uses (verified Oct 2026)

Not a vendor wallet: **"Aomi plans; you sign."** Their widget integrates
Para + wagmi and hands every transaction to the user's local wallet. The
agent never holds keys — their Gate 1 is the human. We cannot copy this:
our product IS autonomous spending (data stage buys, tips, unlocks), a
strictly harder problem than theirs. Their paper surveys the right
mechanisms; their product sidesteps the custody question.

## Track A — CDP server wallet + Policy Engine (Gate 1 vendor)

**SPIKE VERDICT (Oct 2026): DEAD ON ARC.** CDP supports Base, Ethereum,
Arbitrum, Polygon, Optimism, Solana (+ testnets) — Arc (5042/5042002) is not
listed, `evmNetwork` identifiers are a closed set, and Smart Accounts are
Base-only. Revisit only if Coinbase adds Arc; do not build.

(Kept for the record: the mechanism itself is right — project/account
policies, allowlist + `evmData` value caps, fail-secure default. If we ever
operate an agent wallet on a CDP-supported chain, this is the template.)

## Track B — Smart sessions (Gate 2 vendor)

- Rhinestone Smart Sessions / Safe + ERC-7579: session key with USDC spending limit + timeframe + recipient allowlist, enforced onchain.
- Blocked on chain infra: needs EntryPoint + bundler + module deployment on Arc. Verify availability; if absent, Track B is dead on Arc.
- SmartAgentKit (Safe + hook multiplexer + presets) is the packaged form of the same architecture — same infra dependency.

## Track C — Custom spend-limit contract (recommended near-term Gate 2)

**STATUS: DEPLOYED ON ARC TESTNET (Oct 2026).** `NibgateSpender`
`0x903b0606da40d99d78da9d9be6c435acacba5cf0` (tx
`0x1bf713ce6d35a49d45ef48e96f3e0a90901d8da59730b5fd094ff60406e39e1f`):
owner = keeper, agent = hot key, $2/day cap, 8/8 forge tests green.
Deployer holds no privileges (constructor-assigned roles only).

Remaining before enforcement is live: keeper funds it (operating float),
allowlists creator recipients, and the backend tip path is switched from
direct EOA transfer to `spend()`. Gateway EIP-3009 flows stay EOA-bound
(contracts cannot sign) — direct transfers only, by design.

- Minimal `NibgateSpender`: owner = keeper, agent key = spender, per-day USDC cap, recipient allowlist, forge-tested like the splitter. No vendor, no 4337, deployable on Arc today.
- Agent hot wallet becomes the contract; EOA key can only spend through it.
- Accepts the residual: owner/keeper key is still trusted (same as escrow keeper).

## Bypass acceptance tests (Aomi § coverage)

Every gate ships with a test that tries to route around it:
1. Spend proposed without a verdict never executes (`verdict-void`).
2. Over-cap batch (spend mixed into fast batch) is rejected whole.
3. Post-simulation payload swap voids the approval.
4. Unjudged direct `runTool` spend still hits tool-level caps (defense in depth).
5. Owner-key / allowance abuse against session limits (Track B/C only).
6. Evaluator outage: JEV down → runs stop (`judge-unreachable`), never judgeless.

Tests 1–4 are implemented (`loop.test.js`, `executor.test.js`). Test 6 is implemented. Test 5 follows its track.

## Decision

- Build now: verdict binding, bypass tests 1–4+6, dual-RPC guard (done, this repo).
- Track A: dead on Arc. Track B: blocked on 4337 infra (verify if ever needed).
- **Track C wins by default** — custom `NibgateSpender` is the only Gate 2
  deployable on Arc today. Next step when greenlit: forge contract (owner =
  keeper, agent spender, per-day USDC cap, recipient allowlist) + tests +
  testnet deploy, same pattern as the splitter.
- Unverified alternative (spike if float grows): Turnkey-style enclave +
  policy (chain-agnostic signing is plausibly Arc-compatible, unlike CDP's
  closed network list — but docs could not be verified, and it means vendor
  key custody + signing-path rework + monthly cost). Track C first; vendor
  Gate 1 only when the float justifies it.
- Procedural now: hot-wallet float discipline + movement alerting.
- Reconcile is Arc-decimal-safe: it reads logs only from the ERC-20 USDC
  contract address, so the native-leg system event (18-dec) can never
  double-count against the ERC-20 leg (6-dec).
