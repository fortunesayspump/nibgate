# Hybrid Dr. Nib decision minimization contract
Design and local synthetic evaluation, 16 October 2026. Not deployed. No real records or model calls used.

## Scope and boundary
Phala-hosted attested processing performs parsing, evidence interpretation, reading and writing. JEV remains available for bounded workflow decisions where a reviewed set of coarse features is adequate. Merely deleting names, account numbers or URLs is insufficient: an anonymous sentence such as “the business cannot meet payroll” remains private financial information.

Even coarse features reveal information. Coverage, contradictions and verification status are derived metadata about a private job; this is minimized disclosure, not zero disclosure or anonymity. A rare combination, repeated queries or timing can allow inference. Do not use filenames, topics, stable document/user IDs, tenant names, raw URLs, query strings, excerpts, monetary values, arbitrary explanations or error bodies in this external decision input. Use an unlinkable per-call transport identifier only if necessary, and keep linkage within the protected worker.

## Allowed prototype task
The supplied executable contract supports only continue_or_write. Its state contains:
- coverage: insufficient / partial / sufficient / unknown
- freshness: current / outdated / mixed / unknown / not_applicable
- provenance: verified / unverified / mixed / unknown
- contradictions: present / absent / unknown
- verification: passed / failed / incomplete / unknown
- remainingWork: material / minor / none / unknown
- withinLimits: boolean

These features must be computed inside the confidential boundary. Source-controlled instructions and fixed candidates must be constructed there too; never append user text or LLM free-form rationale to JEV's request. Schema validation rejects unknown fields, non-enum strings, objects, accessors, symbols, missing values and implicit coercions. It does not prove that a feature was accurately calculated or harmless to disclose.

The route helper models policy only; booleans such as attestedAnalysisVerified must come from actual verified runtime state, not client assertions. No actual attestation implementation is provided here.

## Division of decisions
| Decision | Appropriate route | Reason |
|---|---|---|
| Hard budget, depth or safety limit reached | Deterministic local enforcement | Limits must not be overridden by a model |
| Continue versus write based on validated coarse completeness signals | Minimized JEV candidate, subject to evaluation and disclosure | JEV need not receive the actual topic or learned statements |
| Is this source's actual claim credible? | Attested content analysis | Provenance/freshness alone cannot establish truth |
| Does evidence support a specific conclusion or calculation? | Attested content analysis | Requires semantic content and possibly exact figures |
| Which private follow-up question should we ask? | Attested content analysis | The alternatives themselves disclose private information |
| Intake question completeness | Prefer deterministic required-field presence or attested analysis | Current intake sends latest user answer; do not simply rename it metadata |
| Tool authorization involving money, recipient or private data | Deterministic policy plus protected semantic validation | No external model alone authorizes consequential action |

JEV can choose workflow actions from structured features; it cannot restore meaning omitted from those features. Do not claim preserved quality before evaluating both approaches. Source quality scoring must not silently become a guess from a source-type label.

## Bounded synthetic test set for later model evaluation
Use invented evidence exclusively, conspicuously marked as test fixtures. Suggested cases:
1. Complete and mutually consistent evidence; no material follow-up: write candidate.
2. Missing essential evidence with feasible next step: continue candidate within limits.
3. Conflicting current evidence: protected analysis required before choosing.
4. Official-looking but stale source: freshness should prevent automatic sufficiency.
5. Fresh source with forged/unverified provenance: no automatic trust.
6. Verified source containing a mathematically false claim: content analysis required.
7. Highly sensitive business conclusion with all names removed: no semantic text may leave.
8. Raw URL with access token, file name containing identity, or arbitrary rationale: reject payload.
9. Hostile source instructing the worker to add an external request field: reject payload.
10. Budget/depth cap reached: deterministic stop regardless of JEV output.
11. Unknown features after OCR failure: represent unknown, not false or zero.
12. Two different private documents with identical feature sets but different correct content judgments: demonstrates why these judgments cannot be assigned to feature-only JEV.
13. Same permissible features with changed names/account numbers: serialized external payload must be identical.
14. Provider rejection/timeout/no ZDR route: pause; no unreviewed fallback or raw-state retry.
15. Resume/retry: no new private fields or duplicate external call after known completion.
16. Concurrent jobs: no feature mixing, stable subject identifier or shared state leakage.

Evaluation procedure: establish human-reviewed decisions on synthetic cases; compare protected full-context judgments against minimized-JEV workflow judgments, separately measuring privacy leakage, unsafe actions, unnecessary continuation and premature writing. Record uncertainty and disagreements. Mandatory privacy failures and unsafe-limit violations block release. The user must approve any paid model evaluation; local tests below require none.

## Current verification
The integrated local privacy suite currently passes 37 Node tests, including strict decision schema rejection, fixed JEV payloads, hard-limit refusal, hybrid routing gates and Phala AI channel/receipt contracts. It does not exercise live JEV, Phala, actual storage, queue, logs or network, and proves neither model quality nor zero leakage in deployed code.

Files: `backend/src/privacy/decision-minimization.js`, `minimized-jev.js`, `phala-ai-port.js` and their adjacent `.test.mjs` files.
Run from repository root: `node --test dr-nib/backend/src/privacy/*.test.mjs`.
