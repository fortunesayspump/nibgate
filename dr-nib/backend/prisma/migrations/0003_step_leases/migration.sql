-- Crash-recovery lease on research steps. A step left `active` past its
-- lease belongs to a dead worker; the boot sweeper resets it and re-enqueues.
ALTER TABLE "ResearchStep" ADD COLUMN "workerId" TEXT;
ALTER TABLE "ResearchStep" ADD COLUMN "leaseUntil" TIMESTAMP(3);
ALTER TABLE "ResearchStep" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ResearchStep_status_leaseUntil_idx" ON "ResearchStep"("status", "leaseUntil");
