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

## Track A — CDP server wallet + Policy Engine (Gate 1 vendor)

- Create CDP project + EVM account for the agent; key lives in CDP TEE, never in `.env`.
- Account policy: `evmAddress` allowlist (USDC + hub/escrow contracts), `evmData` transfer-value caps mirroring `DRNIB_SPEND_MAX_*`, `evmNetwork` pinned to Arc, `signEvmHash` → reject. Fail-secure default (no match = reject) is built in.
- Rework signing path: local viem key → CDP encode-sign-send. Gateway EIP-3009 flow must be re-proven after the swap (soak re-run).
- **Open question (verify before building): does CDP support Arc (5042/5042002)?** If not, Track A is dead and Track C wins by default.

## Track B — Smart sessions (Gate 2 vendor)

- Rhinestone Smart Sessions / Safe + ERC-7579: session key with USDC spending limit + timeframe + recipient allowlist, enforced onchain.
- Blocked on chain infra: needs EntryPoint + bundler + module deployment on Arc. Verify availability; if absent, Track B is dead on Arc.
- SmartAgentKit (Safe + hook multiplexer + presets) is the packaged form of the same architecture — same infra dependency.

## Track C — Custom spend-limit contract (recommended near-term Gate 2)

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
- Spec now, build on decision: Track A vs C — verify Arc support for CDP + 4337 infra first (one research spike, no code).
- Procedural now: hot-wallet float discipline + movement alerting.
