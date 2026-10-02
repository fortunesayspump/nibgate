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
CREATE TABLE "ResearchStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB,
    "output" JSONB,
    "cost" DECIMAL(18,6) NOT NULL DEFAULT 0,
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

-- CreateIndex
CREATE INDEX "ResearchRun_userId_updatedAt_idx" ON "ResearchRun"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ResearchRun_status_updatedAt_idx" ON "ResearchRun"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ResearchRun_deletedAt_idx" ON "ResearchRun"("deletedAt");

-- CreateIndex
CREATE INDEX "ResearchStep_runId_kind_idx" ON "ResearchStep"("runId", "kind");

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
