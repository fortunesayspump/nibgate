-- CreateTable
CREATE TABLE "NibShare" (
    "id" TEXT NOT NULL,
    "ownerWallet" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "coverUrl" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "bodyLength" INTEGER NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "expiresAt" TIMESTAMP(3),
    "whitelist" TEXT[],
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageRef" TEXT,
    "ciphertextUrl" TEXT,
    "metadataUrl" TEXT,
    "contentHash" TEXT NOT NULL,
    "keyProvider" TEXT NOT NULL DEFAULT 'server',
    "encryptedKey" TEXT,
    "decryptMode" TEXT NOT NULL DEFAULT 'client',
    "status" TEXT NOT NULL DEFAULT 'active',
    "unlockCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NibShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NibShareEntitlement" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "NibShareEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NibShareEvent" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "wallet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NibShareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NibShareReceipt" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "payerWallet" TEXT NOT NULL,
    "txHash" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keyGrantedAt" TIMESTAMP(3),

    CONSTRAINT "NibShareReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NibShare_slug_key" ON "NibShare"("slug");

-- CreateIndex
CREATE INDEX "NibShare_ownerWallet_idx" ON "NibShare"("ownerWallet");

-- CreateIndex
CREATE INDEX "NibShare_status_expiresAt_idx" ON "NibShare"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "NibShare_createdAt_idx" ON "NibShare"("createdAt");

-- CreateIndex
CREATE INDEX "NibShareEntitlement_wallet_idx" ON "NibShareEntitlement"("wallet");

-- CreateIndex
CREATE INDEX "NibShareEntitlement_status_idx" ON "NibShareEntitlement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NibShareEntitlement_shareId_wallet_key" ON "NibShareEntitlement"("shareId", "wallet");

-- CreateIndex
CREATE INDEX "NibShareEvent_shareId_createdAt_idx" ON "NibShareEvent"("shareId", "createdAt");

-- CreateIndex
CREATE INDEX "NibShareEvent_createdAt_idx" ON "NibShareEvent"("createdAt");

-- CreateIndex
CREATE INDEX "NibShareReceipt_shareId_idx" ON "NibShareReceipt"("shareId");

-- CreateIndex
CREATE INDEX "NibShareReceipt_payerWallet_idx" ON "NibShareReceipt"("payerWallet");

-- AddForeignKey
ALTER TABLE "NibShareEntitlement" ADD CONSTRAINT "NibShareEntitlement_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NibShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NibShareEvent" ADD CONSTRAINT "NibShareEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NibShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NibShareReceipt" ADD CONSTRAINT "NibShareReceipt_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NibShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
