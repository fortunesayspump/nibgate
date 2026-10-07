-- Episodic agent memory: verbal lessons distilled from failed runs.
CREATE TABLE "AgentLesson" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentLesson_createdAt_idx" ON "AgentLesson"("createdAt");
