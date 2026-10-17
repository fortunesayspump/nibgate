# Private AI budget admission: integration and limits

Status: local prototype, 16 October 2026. No paid calls, deployment, migration application, or real provider spend were made. Do not enable live owner testing until the integration and operational checks below pass.

## Budget policy

The $5/month target is **total infrastructure plus private AI**, not an AI allowance. Configure two positive integer micro-USD values, `monthlyAiCapMicroUsd` and `monthlyInfraCeilingMicroUsd`, whose sum is at most 5,000,000. The AI cap must be below 5,000,000. The infrastructure ceiling is a planning allocation only: this software does not observe or stop infrastructure bills. A provider-side spending hard cap is also not established. The ledger is a fail-closed local admission control, not a guarantee that actual total bills cannot exceed $5.

Supply an exact, pinned model identifier and explicit input/output price **ceilings** in micro-USD per million tokens. No price defaults or aliases are allowed. Obtain the actual ceilings from the provider's official current terms before a live call, include any applicable provider/route surcharge, and refresh or disable the model when prices change. Unknown model or missing price configuration rejects before AI dispatch. For now, none is supplied in source control, so no paid request is possible from this module alone.

The guest entrypoint must additionally keep its owner-only test flag off by default. This gate checks `tenantId === ownerUserId` and rechecks the persisted run owner, deleted status, and confidential mode inside the admission transaction. `tenantId` must come from authenticated capability/run state, not a caller-supplied browser field. The accepted `ownerUserId` must be provisioned outside source control. All private AI calls in the full job must go through this one wrapper; a legacy, demo, retry, or fallback path that can still call the provider defeats the cap.

## One-run reservation flow

The measured guest calls `createPrivateAiBudgetGate({db, ownerUserId, monthlyAiCapMicroUsd, monthlyInfraCeilingMicroUsd, modelPriceCeilings, clock})`. Then it calls `gate.run({runId, tenantId, model, maxCalls: 3, maxPromptBytesPerCall: 150000, maxOutputTokensPerCall: 1200, execute: async ({infer}) => ...})` **before the first model dispatch**. Replace the job's `aiPort.infer` with a closure that uses the provided `infer`:

```js
const budgetedAiPort = {
  privateVerifiedTransport: 'phala-aci-v1',
  infer: ({model: requestedModel, messages}) => {
    if (requestedModel !== model) throw new Error('PRIVATE_AI_REQUEST_OUT_OF_BOUNDS');
    return infer({messages, dispatch: async ({model, messages}) => ({
      value: await aiPort.infer({model, messages}),
    })});
  },
};
```

The example keeps the entire worst-case reservation even on success, because the current Phala receipt adapter verifies route/request identity but does not expose provider-signed token counters. Never discount from `result.usage`, a non-attested JSON field, a model-generated claim, or local token estimates. Do not log plaintext prompts, responses, receipts, or raw provider exceptions.

The database migration `0008_private_ai_budget` adds a run-unique durable reservation. The ledger uses one PostgreSQL transaction-scoped global advisory lock for all admissions and reconciliations. Under that lock it sums **committed** micro-USD for the UTC calendar month; open and uncertain reservations count at their full worst-case amount. If the next reservation exceeds the monthly AI cap, dispatch is refused. The run ID is unique, so retries cannot buy a second reservation or issue a second paid request. Never delete or expire an uncertain reservation to free budget. A settled reservation with no valid signed usage also remains charged at its full reservation. Hard deletion of a run intentionally does not cascade-delete the spend ledger.

The bound is calculated per call from a maximum of 150,000 serialized UTF-8 prompt bytes, at most 100 message objects, at most 1,200 output tokens, and a maximum of three calls. The input-token allowance is `2 * maxPromptBytesPerCall + 1024 * 100 + 8192`. The cost of each input and output component is rounded **up** to an integer micro-USD; the sum is multiplied by `maxCalls`. Actual prompt JSON bytes and call count are checked before every dispatch. The current verified AI port also enforces its own message and token cap. The provider can bill hidden tokens or use a different tokenizer/protocol overhead. If a signed usage receipt later shows tokens beyond the allowance, the gate keeps the full reservation, stops the job, and requires an operator investigation. This estimate and local gate must not be represented as a provider hard cap.

On any dispatch error, process interruption, malformed signed usage, or unverifiable response, the full reservation stays counted. A crash after admission leaves status `reserved`, likewise counted in full; the recovery path must not automatically replay an uncertain paid call. Error surfaces use fixed safe codes only. No prompt or response, provider error, or raw signed receipt is stored in the budget table.

## Future signed-usage reconciliation

The gate has an optional `verifySignedUsage` hook. Only add it after confirming the official Phala/provider SDK's precise signed receipt format and verifying its signature chain and binding to the exact request, model, call ID, session, and token counters **inside the measured guest**. It must return `{verified:true, signed:true, model, callId, requestDigest, inputTokens, outputTokens}` corresponding to the expected arguments, or fail. All attempted calls must have individually valid signed usage to reduce the reservation; one missing/invalid receipt retains the full reservation. Do not enable a hook that merely copies `result.usage` or sets `signed:true` itself. This prototype does not assert that the current SDK signs usage.

## Before any owner-live test

1. Review/rehearse migration 0008 against the intended Dr. Nib database and verify the generated Prisma client exposes `privateAiBudgetReservation`; do not use `db push` as an unreviewed substitute.
2. Pin the exact model and current official price ceilings; configure AI and infrastructure allocations totaling no more than $5/month, and set a real provider-side cap if the provider supports one. Check that the worst-case three-call reservation fits the AI subcap.
3. Show that the default-disabled guest flag, authenticated owner binding, and every private AI path use this gate, including recovery and potential deepen paths. Ensure one job/run can never bypass it by changing the run type, retrying, or falling back to an ordinary AI port.
4. Run synthetic concurrent overspend, unknown-price, call-limit, token/byte-limit, uncertain response, restart, month rollover, and wrong-owner tests against real PostgreSQL. The adjacent local unit tests use a synthetic mutex/ledger, not a real PostgreSQL instance.
5. Verify an actual signed usage specification before using discounted reconciliation. Until then, budget for the full reservation on every admitted run.

This budget gate deliberately does not execute a model call, deploy infrastructure, or establish provider billing facts.

## Live metering, probe-verified (2026-10-17)

The ACI compatibility probe (`backend/src/privacy/aci-receipt-probe.mjs`) ran one
real call against `inference.phala.com` and changed the signed-usage picture:

- The signed receipt still does **not** embed token counters or cost. Its
  `event_log` commits `sha256:<body>` for the request **and the response**
  (`request.received`, `response.received`, `response.returned`).
- The OpenAI-shaped completion carries `usage: {prompt_tokens,
  completion_tokens, reasoning_tokens, cost}`.
- Hashing our exact response bytes and matching the receipt's `response.*`
  `body_hash` **succeeded** (`usageAuthenticated: true`). So `usage.cost` is
  bound to the signed receipt by hash, even though it is not inside it.

The adapter (`phala-aci-adapter.js`) now requires that binding: `verifyReceipt`
rejects any response whose bytes do not hash to a committed `response.*` event.
The AI port attaches the bound counters as a non-enumerable `PRIVATE_USAGE`
symbol; the guest's `verifySignedUsage` hook validates that value's shape and
consistency and returns it to the gate. A hook that lacks a matching
`responseDigest` fails closed, so the reservation stays whole.

Residual assumption, stated plainly: the guest is measured TEE code and the
receipt binds the counters it reports. The broker meters the guest's reported,
receipt-bound `costMicroUsd`, so the receipt binding — not the guest's honesty —
is what prevents provider inflation. Re-review this section whenever the ACI
receipt format changes.
