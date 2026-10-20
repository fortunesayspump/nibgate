CREATE TABLE "PrivateToolCall" (
 "id" TEXT PRIMARY KEY, "runId" TEXT NOT NULL REFERENCES "ResearchRun"("id") ON DELETE CASCADE,
 "questionId" TEXT NOT NULL, "tool" TEXT NOT NULL, "request" JSONB NOT NULL,
 "requestDigest" TEXT NOT NULL, "manifestRevision" INTEGER NOT NULL, "recipientPublicKey" TEXT NOT NULL, "recipientId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'approved', "reservedMicroUsd" BIGINT NOT NULL,
 "committedMicroUsd" BIGINT NOT NULL DEFAULT 0, "costBasis" TEXT NOT NULL DEFAULT 'reservation',
 "resultEnvelope" JSONB, "resultDigest" TEXT, "txHash" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PrivateToolCall_amounts" CHECK ("reservedMicroUsd">=0 AND "reservedMicroUsd"<=2000000 AND "committedMicroUsd">=0 AND "committedMicroUsd"<="reservedMicroUsd"),
 CONSTRAINT "PrivateToolCall_status" CHECK ("status" IN ('approved','reserved','complete','failed'))
);
CREATE UNIQUE INDEX "PrivateToolCall_runId_questionId_key" ON "PrivateToolCall"("runId","questionId");
CREATE INDEX "PrivateToolCall_runId_status_idx" ON "PrivateToolCall"("runId","status");
