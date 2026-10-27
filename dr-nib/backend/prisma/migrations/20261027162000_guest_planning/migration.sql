CREATE TABLE "GuestPlanningSession" (
 "id" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "tenantId" TEXT NOT NULL,
 "runId" TEXT NOT NULL, "vaultId" TEXT NOT NULL, "policy" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'active', "requests" INTEGER NOT NULL DEFAULT 0,
 "adoption" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GuestPlanningSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestPlanningSession_tokenHash_key" ON "GuestPlanningSession"("tokenHash");
CREATE UNIQUE INDEX "GuestPlanningSession_tenantId_key" ON "GuestPlanningSession"("tenantId");
CREATE UNIQUE INDEX "GuestPlanningSession_runId_key" ON "GuestPlanningSession"("runId");
CREATE UNIQUE INDEX "GuestPlanningSession_vaultId_key" ON "GuestPlanningSession"("vaultId");
CREATE INDEX "GuestPlanningSession_expiresAt_idx" ON "GuestPlanningSession"("expiresAt");
CREATE TABLE "GuestPlanningRateWindow" (
 "id" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "GuestPlanningRateWindow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GuestPlanningRateWindow_expiresAt_idx" ON "GuestPlanningRateWindow"("expiresAt");
