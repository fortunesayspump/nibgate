-- Per-user memory of cited domains (see schema comment).
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

-- CreateIndex
CREATE UNIQUE INDEX "QueryMemory_userId_domain_key" ON "QueryMemory"("userId", "domain");

-- CreateIndex
CREATE INDEX "QueryMemory_userId_idx" ON "QueryMemory"("userId");
