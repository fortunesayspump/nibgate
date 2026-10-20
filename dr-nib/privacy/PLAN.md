# Remaining production plan

Updated 20 October 2026. The local workflow is accepted for its stated tests; production cutover is not complete. This document lists outstanding work. See [STATUS.md](STATUS.md) for passed evidence and [PRODUCTION.md](PRODUCTION.md) for lifecycle design.

## Before an owner-only hosted canary

1. Prepare production-specific database roles/migrations, private ciphertext storage, broker signing keys and sealed guest credentials. Release preparation currently requires the dedicated synthetic database. Do not repurpose its state as production data.
2. Configure separate broker, funding and independently supervised watchdog processes after approval. Existing Railway Dr. Nib starts the ordinary server. Make the funding listener's loopback-only binding configurable for its hosting environment.
3. Configure a reviewed online verifier and release policy for browser and broker, browser CORS and broker TLS SPKI pinning. Demonstrate fresh-boot browser key delivery without manual fixed-boot repinning. Do not relax measurements.
4. Refresh JEV/fallback logging and ZDR reviews before starting; retain their 24-hour expiry and establish renewal/alerts. Review deliberate renewal of the durable cumulative runtime allowance; it is not a per-request reset.
5. Restrict the first canary to the authorized owner, one active research operation, bounded queue, five-minute idle grace and explicit operator spend limits. Use production hosting with Arc Testnet payments first.
6. Verify production-origin cookies, Google/wallet login, upload, intake/answers, plan/funding, research, owner questions, pause/resume, reboot recovery, report/discussion, exports and confirmed settlement/refund. Inspect network payloads and logs for content leakage.
7. Rehearse rollback: stop new admissions, preserve ciphertext/checkpoints/escrow, reconcile in-flight money, drain and confirm stop. Never route private work into the ordinary plaintext pipeline.

## Before mainnet or general-user activation

- Implement/review mainnet private paid-source execution: the current executor explicitly accepts only testnet. Verify chain/token/contracts/keeper limits and run separately authorized, capped real-money smoke tests.
- Replace the single-owner restriction with reviewed tenant admission/isolation before inviting multiple accounts. Add fairness/capacity controls; do not provision a VM per visitor.
- Complete physical second-device recovery, representative alternative-wallet/Google regression and creator claim/release. A held tip is not proof that a creator claimed it.
- Exercise the intended topology under longer soak, crashes, provider partitions, uncertain payment/model outcomes and quota exhaustion. Synthetic controller throughput is not model throughput or a production SLA.
- Decide legacy plaintext-project handling, retention/deletion, client/release governance and incident support. Historical plaintext projects do not become encrypted by relabeling them.
- Keep compute/storage operator-funded until a per-run allocation meter, disclosed rate and atomic budget reservation exist.

## Completed scope

Client encryption/vault recovery; measured guest and confidential primary inference; actual hosted JEV; disclosed ZDR fallback; encrypted uploads/state/activity/reports/exports; checkpointed recovery; bounded tools/terminal; testnet paid creator delivery and held tips; funded report, settlement/refund and expense receipts passed their recorded checks. See [acceptance](MIGRATION-ACCEPTANCE.md).

Historical phases remain in [the archive](../archive/privacy-2026-10-20/PLAN.md). This plan authorizes no deployment or spending.
