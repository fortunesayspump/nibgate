-- Durable, global admission accounting. Apply only after migration review and
-- rehearsal. All monetary fields are integer micro-USD, not floating point.
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

    CONSTRAINT "PrivateAiBudgetReservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PrivateAiBudgetReservation_amounts_check" CHECK (
      "reservedMicroUsd" > 0 AND "committedMicroUsd" >= 0 AND
      "committedMicroUsd" <= "reservedMicroUsd"
    ),
    CONSTRAINT "PrivateAiBudgetReservation_status_check" CHECK (
      "status" IN ('reserved', 'settled', 'uncertain')
    ),
    CONSTRAINT "PrivateAiBudgetReservation_month_check" CHECK (
      "monthKey" ~ '^[0-9]{4}-[0-9]{2}$'
    )
);
CREATE UNIQUE INDEX "PrivateAiBudgetReservation_runId_key"
    ON "PrivateAiBudgetReservation"("runId");
CREATE INDEX "PrivateAiBudgetReservation_monthKey_status_idx"
    ON "PrivateAiBudgetReservation"("monthKey", "status");
CREATE INDEX "PrivateAiBudgetReservation_tenantId_createdAt_idx"
    ON "PrivateAiBudgetReservation"("tenantId", "createdAt");
-- Deliberately no cascading run FK: deleting a run must never erase spend.
