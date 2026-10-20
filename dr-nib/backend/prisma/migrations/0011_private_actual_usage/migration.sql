-- Historical amounts remain conservative records, never silently repriced.
ALTER TABLE "PrivateInferenceCall" ADD COLUMN IF NOT EXISTS "costBasis" TEXT NOT NULL DEFAULT 'legacy-ceiling';
ALTER TABLE "PrivateInferenceCall" ADD COLUMN IF NOT EXISTS "usageEvidence" JSONB;
