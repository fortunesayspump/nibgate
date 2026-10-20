-- Fixed accounting metadata only; historical owner-test reservations stay held.
ALTER TABLE "PrivateInferenceCall" ADD COLUMN IF NOT EXISTS "billingKind" TEXT NOT NULL DEFAULT 'owner-test';
CREATE INDEX IF NOT EXISTS "PrivateInferenceCall_runId_billingKind_idx" ON "PrivateInferenceCall"("runId", "billingKind");
