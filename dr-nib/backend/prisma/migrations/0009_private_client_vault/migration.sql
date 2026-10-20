-- Additive ciphertext coordination only; never rewrites legacy records.
CREATE TABLE "PrivateVaultRecord" (
  "userId" TEXT NOT NULL, "vaultId" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "recoveryEnvelope" JSONB NOT NULL, "passkey" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivateVaultRecord_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "PrivateVaultRecord_vaultId_key" ON "PrivateVaultRecord"("vaultId");
CREATE TABLE "PrivateClientObject" (
  "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "vaultId" TEXT NOT NULL,
  "objectId" TEXT NOT NULL, "kind" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "envelope" JSONB, "objectKey" TEXT, "digest" TEXT NOT NULL,
  "removed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivateClientObject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivateClientObject_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PrivateClientObject_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "PrivateClientObject_location_check" CHECK (("envelope" IS NULL) <> ("objectKey" IS NULL))
);
CREATE UNIQUE INDEX "PrivateClientObject_runId_objectId_key" ON "PrivateClientObject"("runId", "objectId");
CREATE INDEX "PrivateClientObject_runId_kind_removed_idx" ON "PrivateClientObject"("runId", "kind", "removed");

CREATE TABLE "PrivateActionReceipt" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
 "digest" TEXT NOT NULL, "status" TEXT NOT NULL, "reply" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PrivateActionReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PrivateActionReceipt_runId_requestId_key" ON "PrivateActionReceipt"("runId", "requestId");
CREATE INDEX "PrivateActionReceipt_runId_status_idx" ON "PrivateActionReceipt"("runId", "status");
CREATE TABLE "PrivateInferenceCall" (
 "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "actionId" TEXT NOT NULL, "model" TEXT NOT NULL,
 "reservedMicroUsd" BIGINT NOT NULL, "committedMicroUsd" BIGINT NOT NULL,
 "status" TEXT NOT NULL, "monthKey" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PrivateInferenceCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrivateInferenceCall_monthKey_status_idx" ON "PrivateInferenceCall"("monthKey", "status");
CREATE INDEX "PrivateInferenceCall_runId_actionId_idx" ON "PrivateInferenceCall"("runId", "actionId");
