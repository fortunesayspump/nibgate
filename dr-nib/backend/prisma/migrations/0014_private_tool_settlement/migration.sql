-- Public payment attribution only; never contains a signature or private research.
ALTER TABLE "PrivateToolCall" ADD COLUMN IF NOT EXISTS "paymentEvidence" JSONB;
