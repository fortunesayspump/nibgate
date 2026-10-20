# Private migration acceptance

Updated 20 October 2026. Local implementation and targeted real E2Es are accepted only for the scopes below. Public production cutover, full multi-tenant stress acceptance and a production SLA are not established. See [STATUS.md](STATUS.md) for exact current image, manifest and accounting evidence.

| Area | Evidence | Remaining boundary |
| --- | --- | --- |
| Browser encryption and storage | Real encrypted source upload, saved project/report reload and ciphertext persistence | Production-origin configuration and legacy plaintext-project policy |
| Vault and recovery | Owner-confirmed code replacement, atomic wrapper update and isolated Incognito project recovery | Physical second device and conflicting-device tests |
| Attested processing | Reviewed Phala image, independent production boot checks, fresh recipient-key possession and confidential inference receipts | Online-verifier/fresh-boot browser acceptance after automatic wake |
| Research workflow | Actual JEV, bounded tools, narration, source checks, report/discussion and saved Q&A | Representative quality/latency comparison and broader UI branch checks |
| Recovery | Same funded checkpoint restored without repurchasing completed operations; uncertain outcomes fenced | Production crash/partition/browser-close acceptance and offline-key limits |
| Funded report | Run `d29f2a9b`, escrow job 54: $0.010422 spent, $0.239578 refunded from $0.25 | Mainnet private full-flow acceptance |
| Paid creator access | Earlier real testnet run delivered a $0.20 creator article and settled/refunded | Private paid executor remains testnet-only |
| Creator tipping | Real positive held tip and receipt; budget-protected JEV decision | Creator claim/release; held is not claimed income |
| Exports | Earlier seven-format real downloads; corrected latest PDF references/receipt confirmed by owner | Not every format freshly rerun on the final image; latest PDF was human-confirmed |
| Hosted fallback | Exact deployed image executed locally: injected pre-dispatch primary failure, 8 real Azure responses, 5 JEV calls, 8/8 sampled support checks, accurate disclosure and accounting | Not a forced-failure test on the remote funded CVM or browser |
| Lifecycle | Real wake/verified-readiness/idle stop; isolated DB burst and controller SIGKILL recovery | Supervised production watchdog, longer soak, tenant scheduling and runtime-policy renewal |

All eight supported sampled claims do not establish correctness of every report sentence. Passing synthetic load does not establish model throughput. Testnet transactions do not prove mainnet payment behavior. Browser recovery does not prove unattended restart without a user's keys.

The local guest is stopped and the broker paused after acceptance. No Git push or public frontend deployment occurred. Current work is listed in [PLAN.md](PLAN.md); branch-specific checks remain in [BUTTON-ACCEPTANCE.md](BUTTON-ACCEPTANCE.md). The full dated evidence history is preserved in [the acceptance archive](../archive/privacy-2026-10-20/MIGRATION-ACCEPTANCE.md).
