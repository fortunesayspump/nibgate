# Reviewed private-model candidates

Prices observed in Phala's `/v1/models` catalog on 20 October 2026, in USD per million tokens. Recheck prices and live attested sessions before selection. A catalog TEE label alone is insufficient.

| Route | Input | Output | Acceptance |
|---|---:|---:|---|
| `phala/gemma-4-26b-a4b-uncensored` | $0.15 | $0.70 | Real attested funded report, PDF and settlement acceptance passed |
| `qwen/qwen3.8-27b` | $0.20 | $2.50 | Prior real research/export acceptance; recent upstream overload confirmed by Phala |
| `qwen/qwen-2.5-7b-instruct` | $0.10 | $0.20 | Candidate; quality and full workflow not qualified |
| `google/gemma-4-31b-it` | $0.15 | $0.46 | Candidate; current serving aliases do not satisfy our exact canonical-session match |
| `z-ai/glm-5.3-flash` | $0.15 | $0.50 | Model-scoped hardware-bound session discovered; gateway refuses the pinned serving session, so generation/quality remain unqualified |
| `openai/gpt-oss-120b` | $0.15 | $0.60 | Current Tinfoil router-scoped session; model-instance serving is not established by that evidence |

`dr-nib/tools/private-model-catalog.mjs` ranks only independently quality-approved routes that have current exact canonical-model sessions, advertised required parameters, prices within the reviewed ceilings, no cooldown, and a reservation that fits the remaining budget. `scripts/drnib-private-model-candidates.mjs` obtains metadata over the pinned, production-verified ACI channel and writes a review candidate without running inference. Approval of model quality is separate from availability and affordability. Small or cheap models are not automatically considered suitable.

The reviewed hybrid guest deploys the explicitly authorized Phala/Azure mode described below. Strict confidential mode separately supports measured policy `PRIVATE_AI_MODEL_POOL=gemma-qwen-canary-v1`, selected by `DRNIB_RELEASE_MODEL_POOL` during release preparation. It tries Gemma before Qwen, with independent verified ports, model-specific profiles/prices and cooldowns, actual-model receipt accounting and the shared admission lock. Estimates use the most expensive pool prices so a cheaper initial choice does not understate the possible fallback. Default release policy is the literal `single`; encrypted secrets cannot supply the routing policy. This strict canary pool is separate from the deployed hybrid mode and is not production quality certification.

Only a proven non-dispatch session failure, signed session refusal or persisted pre-dispatch cooldown permits rotation. Each candidate must still discover current exact canonical sessions on its verified channel. A forwarded 429, timeout, unknown completion, invalid receipt or attestation failure stops the operation. Existing unresolved actions remain fenced across pool instances and worker restarts. JEV remains the same disclosed TypeSafe ZDR route. The other catalog candidates remain ineligible pending compatibility and quality qualification.

Strict confidential mode never enables ordinary OpenRouter research fallback. The separately owner-authorized hybrid canary described below explicitly permits it. [OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr) constrains retention, not this application's hardware-attested confidential serving contract. Such a route would need its own provider visibility disclosure and user authorization; it cannot silently inherit the confidential route's claim.

Never substitute aliases, weaken TEE checks, enable ordinary-provider fallback, enlarge the budget or clear a hold to obtain availability. Preserve completed checkpoints across upgrades. Quality, narration, citations, exports and settlement must pass before adding a route to the production-qualified set.

### GLM Flash / GPT-OSS qualification attempt — 20 October 2026

Both routes were rechecked through the pinned production-verified ACI gateway. The live catalog advertises TEE serving, JSON mode and bounded output for each, at the prices above. Initial unfiltered discovery and exact-name preflights rejected both. The documented model-filtered queries then found additional provider-specific sessions; discovery now uses those queries. Evidence: `/tmp/drnib-alternate-{metadata,preflight,scoped-sessions}-20261020.json`.

GLM's Fortanix/Armet session binds the exact model-local name `GLM-5.3-Flash` to TDX report data, GPU evidence, TLS and current TCB. The local matcher accepts only that explicit translation with the reviewed TD measurement `f43c310e47b36bf4ae30cd55c5b3d05f807a7a5658e057f6ae18b0c12e9f30a5`, exact verifier/boundary and all required hardware/model-instance assertions. Unknown names, router scopes and missing claims remain rejected. The model-scoped serving preflight passed, but the bounded real qualification request was refused twice by the gateway with signed session-not-accepted evidence. Call `181f56f8-b2c2-49cc-9b55-7bb99fb48759` is `not-dispatched`, committed zero. No completion or quality pass was fabricated. Evidence: `/tmp/drnib-glm-metered-qualification.log`; the original reservation/refusal proofs remain in the ledger.

GPT-OSS's current Tinfoil evidence proves the confidential router channel, with GPU/model-instance evidence unknown. It is not admitted under the existing model-instance serving requirement. Other GLM routes returned gateway-only/OutOfDate or proxy-scoped evidence and were excluded. Neither requested model is promoted into runtime rotation. GLM generation/quality testing needs the pinned session to be accepted; GPT-OSS first needs model-instance evidence. JEV is unchanged; total committed AI allowance remains $0.717729 against $0.77, including old unresolved holds. No new inference charge or additional unresolved hold resulted from these qualification attempts.

### Owner-approved hosted ZDR fallback (local canary)

Measured mode `phala-openrouter-zdr-canary-v1` keeps Phala Gemma primary and uses OpenRouter `openai/gpt-4o-mini` pinned to Azure when needed. Catalog review observed $0.15/M input and $0.60/M output; per-call actual usage is provider-reported and separately labeled. ZDR, deny collection, fixed provider, required parameters and disabled implicit provider fallback are enforced. The original research API key was confirmed to belong to the already reviewed no-logging workspace. JEV is unchanged. UI disclosure explicitly says that OpenRouter/Azure can process research context while decryption and persistence remain in the private worker.

Public synthetic tests returned correctly priced responses with correct arithmetic, fictional labeling, confounding and no causal/significance/commercial claims. Short-summary word count and exact-quote generation did not meet every fixture requirement; the canary retains the worker's length gate, quote validation, passage fallback and bounded report repair. These probes are not full report acceptance or a provider reliability SLA. Current real funded acceptance is recorded in STATUS.md. Qwen3 32B / DeepInfra was also probed cheaply but was not selected for the canary after repeated short-summary length misses.

### Forced hybrid routing acceptance — 20 October 2026

The exact deployed image completed a local public-fixture research workflow after an injected primary pre-dispatch session failure. The production router made eight real Azure requests and five real JEV judgments; eight sampled claims passed after bounded verification recovery. Activity explicitly disclosed hosted processing; actual provider costs were accounted separately, with no new unresolved hold. Successful run $0.002322; all diagnostic attempts $0.004876. The injected primary transport was never called. This establishes local forced-routing/workflow behavior, not an actual Phala outage, remote-CVM forced failover or provider reliability SLA. See [STATUS.md](STATUS.md) for evidence and budget reconciliation.
