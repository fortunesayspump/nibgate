-- Backfill: capture the access-control schema that was previously applied via
-- `prisma db push` (2026-08) so migration history converges with schema.prisma.
--
-- Idempotent: safe on both a fresh migration-built DB (creates the objects) and
-- a db-push-managed DB (guards no-op). Also drops the deprecated refundedAt
-- column if it ever existed (it was never in migration history).

-- BlogPost: access-control columns (replaces the removed free-text "tag")
ALTER TABLE "BlogPost" DROP COLUMN IF EXISTS "tag";
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "publicAccess" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "whitelist" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "whitelistPrice" TEXT;

-- User: wallet binding
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "walletAddress" TEXT;

-- Rating
CREATE TABLE IF NOT EXISTS "Rating" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- BlogPostEntitlement
CREATE TABLE IF NOT EXISTS "BlogPostEntitlement" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'free',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "BlogPostEntitlement_pkey" PRIMARY KEY ("id")
);

-- BlogPostReceipt (refundedAt intentionally absent; payments are irreversible)
CREATE TABLE IF NOT EXISTS "BlogPostReceipt" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "payerWallet" TEXT NOT NULL,
    "txHash" TEXT,
    "paymentNonce" TEXT,
    "amount" TEXT NOT NULL DEFAULT '0',
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keyGrantedAt" TIMESTAMP(3),

    CONSTRAINT "BlogPostReceipt_pkey" PRIMARY KEY ("id")
);

-- BlogPostEvent
CREATE TABLE IF NOT EXISTS "BlogPostEvent" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "wallet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Rating_siteId_idx" ON "Rating"("siteId");
CREATE INDEX IF NOT EXISTS "Rating_postId_idx" ON "Rating"("postId");
CREATE UNIQUE INDEX IF NOT EXISTS "Rating_postId_wallet_key" ON "Rating"("postId", "wallet");

CREATE INDEX IF NOT EXISTS "BlogPostEntitlement_siteId_idx" ON "BlogPostEntitlement"("siteId");
CREATE INDEX IF NOT EXISTS "BlogPostEntitlement_postId_idx" ON "BlogPostEntitlement"("postId");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPostEntitlement_postId_wallet_key" ON "BlogPostEntitlement"("postId", "wallet");

CREATE INDEX IF NOT EXISTS "BlogPostReceipt_siteId_idx" ON "BlogPostReceipt"("siteId");
CREATE INDEX IF NOT EXISTS "BlogPostReceipt_postId_idx" ON "BlogPostReceipt"("postId");
CREATE INDEX IF NOT EXISTS "BlogPostReceipt_payerWallet_idx" ON "BlogPostReceipt"("payerWallet");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPostReceipt_paymentNonce_postId_key" ON "BlogPostReceipt"("paymentNonce", "postId");

CREATE INDEX IF NOT EXISTS "BlogPostEvent_siteId_idx" ON "BlogPostEvent"("siteId");
CREATE INDEX IF NOT EXISTS "BlogPostEvent_postId_idx" ON "BlogPostEvent"("postId");

CREATE INDEX IF NOT EXISTS "User_siteId_walletAddress_idx" ON "User"("siteId", "walletAddress");

-- Foreign keys (guarded so repeated application never double-adds)
ALTER TABLE "Rating" DROP CONSTRAINT IF EXISTS "Rating_postId_fkey";
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlogPostEntitlement" DROP CONSTRAINT IF EXISTS "BlogPostEntitlement_postId_fkey";
ALTER TABLE "BlogPostEntitlement" ADD CONSTRAINT "BlogPostEntitlement_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlogPostReceipt" DROP CONSTRAINT IF EXISTS "BlogPostReceipt_postId_fkey";
ALTER TABLE "BlogPostReceipt" ADD CONSTRAINT "BlogPostReceipt_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BlogPostEvent" DROP CONSTRAINT IF EXISTS "BlogPostEvent_postId_fkey";
ALTER TABLE "BlogPostEvent" ADD CONSTRAINT "BlogPostEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deprecated refund bookkeeping column (removed from schema 2026-08)
ALTER TABLE "BlogPostReceipt" DROP COLUMN IF EXISTS "refundedAt";
