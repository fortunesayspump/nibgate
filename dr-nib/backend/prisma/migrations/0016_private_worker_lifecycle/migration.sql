-- Ciphertext-free lifecycle coordination only. No prompts, keys or provider credentials.
CREATE TABLE "PrivateWorkerLifecycle" (
  "id" TEXT PRIMARY KEY,
  "state" JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
