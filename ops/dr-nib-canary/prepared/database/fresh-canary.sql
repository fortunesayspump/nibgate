-- Fresh isolated database only. Apply as migration administrator with psql ON_ERROR_STOP.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'drnib_private_canary' OR EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name='drnib') THEN RAISE EXCEPTION 'Fresh canary database required'; END IF;
END $$;
REVOKE ALL ON DATABASE "drnib_private_canary" FROM PUBLIC;
CREATE SCHEMA "drnib";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA "drnib" FROM PUBLIC;
SET LOCAL search_path TO "drnib";
-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "walletAddress" TEXT,
    "title" TEXT,
    "description" TEXT,
    "brief" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "plan" JSONB,
    "depth" TEXT NOT NULL DEFAULT 'standard',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pauseReason" TEXT,
    "pendingQuestion" JSONB,
    "pendingGuidance" JSONB,
    "budgetCap" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "versions" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateWorkerObject" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "envelope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateWorkerObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateAiBudgetReservation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "maxCalls" INTEGER NOT NULL,
    "maxPromptBytesPerCall" INTEGER NOT NULL,
    "maxOutputTokensPerCall" INTEGER NOT NULL,
    "reservedMicroUsd" BIGINT NOT NULL,
    "committedMicroUsd" BIGINT NOT NULL,
    "verifiedCalls" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PrivateAiBudgetReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB,
    "output" JSONB,
    "cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "workerId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "domain" TEXT,
    "relevance" DOUBLE PRECISION,
    "trust" DOUBLE PRECISION,
    "cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchClaim" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "passages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchReport" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "markdown" TEXT NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchExport" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "reportVersion" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "r2Key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLedger" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "txRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchDecision" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'decision',
    "type" TEXT,
    "step" TEXT NOT NULL,
    "prompt" TEXT,
    "question" JSONB NOT NULL,
    "criteria" JSONB,
    "answer" JSONB,
    "output" JSONB,
    "confidence" DOUBLE PRECISION,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "response" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueryMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "reads" INTEGER NOT NULL DEFAULT 0,
    "cites" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueryMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLesson" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateVaultRecord" (
    "userId" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "recoveryEnvelope" JSONB NOT NULL,
    "passkey" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateVaultRecord_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PrivateClientObject" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "envelope" JSONB,
    "objectKey" TEXT,
    "digest" TEXT NOT NULL,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateClientObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateActionReceipt" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reply" JSONB,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateActionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateInferenceCall" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "billingKind" TEXT NOT NULL DEFAULT 'owner-test',
    "costBasis" TEXT NOT NULL DEFAULT 'legacy-ceiling',
    "usageEvidence" JSONB,
    "reservedMicroUsd" BIGINT NOT NULL,
    "committedMicroUsd" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateInferenceCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateToolCall" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "requestDigest" TEXT NOT NULL,
    "manifestRevision" INTEGER NOT NULL,
    "recipientPublicKey" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "reservedMicroUsd" BIGINT NOT NULL,
    "committedMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "costBasis" TEXT NOT NULL DEFAULT 'reservation',
    "paymentEvidence" JSONB,
    "resultEnvelope" JSONB,
    "resultDigest" TEXT,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateWorkerLifecycle" (
    "id" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateWorkerLifecycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchRun_userId_updatedAt_idx" ON "ResearchRun"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ResearchRun_status_updatedAt_idx" ON "ResearchRun"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ResearchRun_deletedAt_idx" ON "ResearchRun"("deletedAt");

-- CreateIndex
CREATE INDEX "PrivateWorkerObject_runId_kind_createdAt_idx" ON "PrivateWorkerObject"("runId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateWorkerObject_runId_kind_objectId_revision_key" ON "PrivateWorkerObject"("runId", "kind", "objectId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateAiBudgetReservation_runId_key" ON "PrivateAiBudgetReservation"("runId");

-- CreateIndex
CREATE INDEX "PrivateAiBudgetReservation_monthKey_status_idx" ON "PrivateAiBudgetReservation"("monthKey", "status");

-- CreateIndex
CREATE INDEX "PrivateAiBudgetReservation_tenantId_createdAt_idx" ON "PrivateAiBudgetReservation"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchStep_runId_kind_idx" ON "ResearchStep"("runId", "kind");

-- CreateIndex
CREATE INDEX "ResearchStep_status_leaseUntil_idx" ON "ResearchStep"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "ResearchSource_runId_idx" ON "ResearchSource"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSource_runId_url_key" ON "ResearchSource"("runId", "url");

-- CreateIndex
CREATE INDEX "ResearchClaim_runId_idx" ON "ResearchClaim"("runId");

-- CreateIndex
CREATE INDEX "ResearchReport_runId_idx" ON "ResearchReport"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchReport_runId_version_key" ON "ResearchReport"("runId", "version");

-- CreateIndex
CREATE INDEX "ResearchExport_runId_idx" ON "ResearchExport"("runId");

-- CreateIndex
CREATE INDEX "BudgetLedger_runId_idx" ON "BudgetLedger"("runId");

-- CreateIndex
CREATE INDEX "ResearchDecision_runId_seq_idx" ON "ResearchDecision"("runId", "seq");

-- CreateIndex
CREATE INDEX "ResearchDecision_runId_kind_idx" ON "ResearchDecision"("runId", "kind");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_key_key" ON "IdempotencyKey"("userId", "key");

-- CreateIndex
CREATE INDEX "QueryMemory_userId_idx" ON "QueryMemory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QueryMemory_userId_domain_key" ON "QueryMemory"("userId", "domain");

-- CreateIndex
CREATE INDEX "ResearchEvent_runId_seq_idx" ON "ResearchEvent"("runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchEvent_runId_seq_key" ON "ResearchEvent"("runId", "seq");

-- CreateIndex
CREATE INDEX "AgentLesson_createdAt_idx" ON "AgentLesson"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateVaultRecord_vaultId_key" ON "PrivateVaultRecord"("vaultId");

-- CreateIndex
CREATE INDEX "PrivateClientObject_runId_kind_removed_idx" ON "PrivateClientObject"("runId", "kind", "removed");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateClientObject_runId_objectId_key" ON "PrivateClientObject"("runId", "objectId");

-- CreateIndex
CREATE INDEX "PrivateActionReceipt_runId_status_idx" ON "PrivateActionReceipt"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateActionReceipt_runId_requestId_key" ON "PrivateActionReceipt"("runId", "requestId");

-- CreateIndex
CREATE INDEX "PrivateInferenceCall_monthKey_status_idx" ON "PrivateInferenceCall"("monthKey", "status");

-- CreateIndex
CREATE INDEX "PrivateInferenceCall_runId_actionId_idx" ON "PrivateInferenceCall"("runId", "actionId");

-- CreateIndex
CREATE INDEX "PrivateInferenceCall_runId_billingKind_idx" ON "PrivateInferenceCall"("runId", "billingKind");

-- CreateIndex
CREATE INDEX "PrivateToolCall_runId_status_idx" ON "PrivateToolCall"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PrivateToolCall_runId_questionId_key" ON "PrivateToolCall"("runId", "questionId");

-- AddForeignKey
ALTER TABLE "PrivateWorkerObject" ADD CONSTRAINT "PrivateWorkerObject_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchStep" ADD CONSTRAINT "ResearchStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchClaim" ADD CONSTRAINT "ResearchClaim_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchReport" ADD CONSTRAINT "ResearchReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchExport" ADD CONSTRAINT "ResearchExport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLedger" ADD CONSTRAINT "BudgetLedger_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchDecision" ADD CONSTRAINT "ResearchDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchEvent" ADD CONSTRAINT "ResearchEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateClientObject" ADD CONSTRAINT "PrivateClientObject_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateToolCall" ADD CONSTRAINT "PrivateToolCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Export receipts need only these billing facts, never payer proof tokens.
CREATE OR REPLACE VIEW "PrivateToolBillingMetadata" AS
SELECT "id", "runId",
 CASE WHEN "paymentEvidence"->>'billingKind' = 'platform' THEN
  jsonb_build_object('billingKind','platform',
   'providerCostMicroUsd',"paymentEvidence"->>'providerCostMicroUsd',
   'amount',"paymentEvidence"->>'amount')
 ELSE NULL END AS "billingEvidence"
FROM "PrivateToolCall";

ALTER TABLE "PrivateClientObject" ADD CONSTRAINT "PrivateClientObject_revision_check" CHECK ("revision">0), ADD CONSTRAINT "PrivateClientObject_location_check" CHECK (("envelope" IS NULL) <> ("objectKey" IS NULL));
ALTER TABLE "PrivateAiBudgetReservation" ADD CONSTRAINT "PrivateAiBudgetReservation_amounts_check" CHECK ("reservedMicroUsd">0 AND "committedMicroUsd">=0 AND "committedMicroUsd"<="reservedMicroUsd"), ADD CONSTRAINT "PrivateAiBudgetReservation_status_check" CHECK ("status" IN ('reserved','settled','uncertain')), ADD CONSTRAINT "PrivateAiBudgetReservation_month_check" CHECK ("monthKey" ~ '^[0-9]{4}-[0-9]{2}$');
ALTER TABLE "PrivateToolCall" ADD CONSTRAINT "PrivateToolCall_amounts" CHECK ("reservedMicroUsd">=0 AND "reservedMicroUsd"<=2000000 AND "committedMicroUsd">=0 AND "committedMicroUsd"<="reservedMicroUsd"), ADD CONSTRAINT "PrivateToolCall_status" CHECK ("status" IN ('approved','reserved','complete','failed'));
CREATE ROLE "drnib_private_canary_broker" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE "drnib_private_canary" TO "drnib_private_canary_broker";
GRANT USAGE ON SCHEMA "drnib" TO "drnib_private_canary_broker";
ALTER ROLE "drnib_private_canary_broker" IN DATABASE "drnib_private_canary" SET search_path TO "drnib";
CREATE ROLE "drnib_private_canary_guest" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE "drnib_private_canary" TO "drnib_private_canary_guest";
GRANT USAGE ON SCHEMA "drnib" TO "drnib_private_canary_guest";
ALTER ROLE "drnib_private_canary_guest" IN DATABASE "drnib_private_canary" SET search_path TO "drnib";
CREATE ROLE "drnib_private_canary_funding" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE "drnib_private_canary" TO "drnib_private_canary_funding";
GRANT USAGE ON SCHEMA "drnib" TO "drnib_private_canary_funding";
ALTER ROLE "drnib_private_canary_funding" IN DATABASE "drnib_private_canary" SET search_path TO "drnib";
CREATE ROLE "drnib_private_canary_watchdog" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE "drnib_private_canary" TO "drnib_private_canary_watchdog";
GRANT USAGE ON SCHEMA "drnib" TO "drnib_private_canary_watchdog";
ALTER ROLE "drnib_private_canary_watchdog" IN DATABASE "drnib_private_canary" SET search_path TO "drnib";
GRANT SELECT, INSERT ON "drnib"."ResearchRun" TO "drnib_private_canary_broker";
GRANT UPDATE ("status","metadata","deletedAt","updatedAt") ON "drnib"."ResearchRun" TO "drnib_private_canary_broker";
GRANT SELECT, INSERT, UPDATE ON "drnib"."PrivateVaultRecord", "drnib"."PrivateClientObject" TO "drnib_private_canary_broker";
GRANT SELECT ON "drnib"."PrivateActionReceipt", "drnib"."PrivateWorkerObject", "drnib"."ResearchStep" TO "drnib_private_canary_broker";
GRANT SELECT, INSERT, UPDATE ON "drnib"."PrivateWorkerLifecycle" TO "drnib_private_canary_broker";
GRANT SELECT ON "drnib"."ResearchRun", "drnib"."BudgetLedger" TO "drnib_private_canary_guest";
GRANT UPDATE ("status","metadata","budgetCap","updatedAt") ON "drnib"."ResearchRun" TO "drnib_private_canary_guest";
GRANT SELECT, INSERT, UPDATE ON "drnib"."PrivateWorkerObject", "drnib"."PrivateClientObject", "drnib"."PrivateActionReceipt", "drnib"."PrivateInferenceCall", "drnib"."PrivateAiBudgetReservation", "drnib"."ResearchStep" TO "drnib_private_canary_guest";
GRANT SELECT ("id","runId","questionId","tool","requestDigest","status","committedMicroUsd","costBasis","resultDigest","txHash") ON "drnib"."PrivateToolCall" TO "drnib_private_canary_guest";
GRANT SELECT ON "drnib"."PrivateToolBillingMetadata" TO "drnib_private_canary_guest";
GRANT SELECT ("id","userId","walletAddress","metadata","status","budgetCap","deletedAt","settledAt"), UPDATE ("metadata","settledAt","updatedAt") ON "drnib"."ResearchRun" TO "drnib_private_canary_funding";
GRANT SELECT, INSERT ON "drnib"."BudgetLedger" TO "drnib_private_canary_funding";
GRANT SELECT ("id","runId","model","status","billingKind","committedMicroUsd","costBasis","usageEvidence") ON "drnib"."PrivateInferenceCall" TO "drnib_private_canary_funding";
GRANT SELECT ("id","runId","status") ON "drnib"."PrivateActionReceipt" TO "drnib_private_canary_funding";
GRANT SELECT ("id","runId","committedMicroUsd") ON "drnib"."PrivateAiBudgetReservation" TO "drnib_private_canary_funding";
GRANT SELECT ("id","runId","kind","revision","removed","digest") ON "drnib"."PrivateClientObject" TO "drnib_private_canary_funding";
GRANT SELECT, INSERT, UPDATE ON "drnib"."PrivateToolCall" TO "drnib_private_canary_funding";
GRANT SELECT ON "drnib"."PrivateToolBillingMetadata" TO "drnib_private_canary_funding";
GRANT SELECT, INSERT, UPDATE ON "drnib"."PrivateWorkerLifecycle" TO "drnib_private_canary_watchdog";
GRANT SELECT ("id","userId","metadata") ON "drnib"."ResearchRun" TO "drnib_private_canary_watchdog";
GRANT SELECT ("runId","status","leaseUntil") ON "drnib"."PrivateActionReceipt" TO "drnib_private_canary_watchdog";
COMMIT;
-- Roles are NOLOGIN. Provision independent credentials out of band only after review.
