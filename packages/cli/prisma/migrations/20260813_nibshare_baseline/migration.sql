-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "username" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "websiteUrl" TEXT,
    "twitterUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "nonce" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerificationCheckAt" TIMESTAMP(3),
    "verificationFailureReason" TEXT,
    "verificationFailures" INTEGER NOT NULL DEFAULT 0,
    "verifyToken" TEXT NOT NULL,
    "siteToken" TEXT NOT NULL,
    "faviconUrl" TEXT,
    "ogImageUrl" TEXT,
    "lastScanAt" TIMESTAMP(3),
    "lastScanStatus" TEXT,
    "lastScanError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherIdentity" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "handle" TEXT,
    "name" TEXT,
    "walletAddress" TEXT,
    "profileUrl" TEXT,
    "verification" TEXT NOT NULL DEFAULT 'platform_attested',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "publisherId" TEXT,
    "publisherExternalId" TEXT,
    "publisherHandle" TEXT,
    "publisherWallet" TEXT,
    "publisherProfileUrl" TEXT,
    "publisherVerification" TEXT,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'article',
    "tags" TEXT,
    "url" TEXT NOT NULL,
    "path" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "price" DOUBLE PRECISION NOT NULL,
    "recipientWallet" TEXT,
    "accessPolicy" TEXT,
    "unlockPolicy" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnlockReceipt" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "publisherId" TEXT,
    "payerWallet" TEXT,
    "actor" TEXT,
    "paymentId" TEXT NOT NULL,
    "paymentProvider" TEXT,
    "txHash" TEXT,
    "receiptUrl" TEXT,
    "chainId" TEXT,
    "network" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "recipientWallet" TEXT,
    "status" TEXT NOT NULL DEFAULT 'verified',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnlockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentEvent" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRating" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "publisherId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "actor" TEXT,
    "ratingValue" INTEGER NOT NULL,
    "reviewHash" TEXT,
    "txHash" TEXT,
    "proofType" TEXT,
    "proof" TEXT,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "type" TEXT NOT NULL,
    "eventName" TEXT,
    "contentId" TEXT,
    "websiteId" TEXT NOT NULL,
    "publisherId" TEXT,
    "revenue" DOUBLE PRECISION,
    "currency" TEXT,
    "path" TEXT,
    "url" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "bucketStart" TIMESTAMP(3),
    "durationMs" INTEGER,
    "scrollDepth" DOUBLE PRECISION,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricDedupe" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricDedupe_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "bodyMarkdown" TEXT NOT NULL,
    "tag" TEXT,
    "tags" TEXT,
    "coverUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexState" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "coverageState" TEXT,
    "indexingState" TEXT,
    "lastCrawlTime" TIMESTAMP(3),
    "isIndexed" BOOLEAN NOT NULL DEFAULT false,
    "sitemapHash" TEXT,
    "lastInspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "resendContactId" TEXT,
    "resendSyncedAt" TIMESTAMP(3),
    "resendSyncStatus" TEXT NOT NULL DEFAULT 'pending',
    "resendSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

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
    "whitelistPrice" DOUBLE PRECISION,
    "publicAccess" BOOLEAN NOT NULL DEFAULT true,
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
    "source" TEXT NOT NULL DEFAULT 'free',
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
    "paymentNonce" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDC',
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keyGrantedAt" TIMESTAMP(3),

    CONSTRAINT "NibShareReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Website_domain_key" ON "Website"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Website_siteToken_key" ON "Website"("siteToken");

-- CreateIndex
CREATE INDEX "PublisherIdentity_websiteId_idx" ON "PublisherIdentity"("websiteId");

-- CreateIndex
CREATE INDEX "PublisherIdentity_walletAddress_idx" ON "PublisherIdentity"("walletAddress");

-- CreateIndex
CREATE INDEX "PublisherIdentity_handle_idx" ON "PublisherIdentity"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherIdentity_websiteId_externalId_key" ON "PublisherIdentity"("websiteId", "externalId");

-- CreateIndex
CREATE INDEX "Content_contentType_idx" ON "Content"("contentType");

-- CreateIndex
CREATE INDEX "Content_publisherId_idx" ON "Content"("publisherId");

-- CreateIndex
CREATE INDEX "Content_publisherWallet_idx" ON "Content"("publisherWallet");

-- CreateIndex
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Content_websiteId_externalId_key" ON "Content"("websiteId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Content_websiteId_url_key" ON "Content"("websiteId", "url");

-- CreateIndex
CREATE INDEX "UnlockReceipt_websiteId_idx" ON "UnlockReceipt"("websiteId");

-- CreateIndex
CREATE INDEX "UnlockReceipt_publisherId_idx" ON "UnlockReceipt"("publisherId");

-- CreateIndex
CREATE INDEX "UnlockReceipt_payerWallet_idx" ON "UnlockReceipt"("payerWallet");

-- CreateIndex
CREATE INDEX "UnlockReceipt_txHash_idx" ON "UnlockReceipt"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "UnlockReceipt_contentId_paymentId_key" ON "UnlockReceipt"("contentId", "paymentId");

-- CreateIndex
CREATE INDEX "ContentEvent_websiteId_createdAt_idx" ON "ContentEvent"("websiteId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentEvent_contentId_idx" ON "ContentEvent"("contentId");

-- CreateIndex
CREATE INDEX "ContentEvent_eventType_idx" ON "ContentEvent"("eventType");

-- CreateIndex
CREATE INDEX "ContentRating_websiteId_idx" ON "ContentRating"("websiteId");

-- CreateIndex
CREATE INDEX "ContentRating_publisherId_idx" ON "ContentRating"("publisherId");

-- CreateIndex
CREATE INDEX "ContentRating_walletAddress_idx" ON "ContentRating"("walletAddress");

-- CreateIndex
CREATE INDEX "ContentRating_txHash_idx" ON "ContentRating"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRating_contentId_walletAddress_key" ON "ContentRating"("contentId", "walletAddress");

-- CreateIndex
CREATE INDEX "Metric_websiteId_type_createdAt_idx" ON "Metric"("websiteId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Metric_websiteId_eventName_createdAt_idx" ON "Metric"("websiteId", "eventName", "createdAt");

-- CreateIndex
CREATE INDEX "Metric_websiteId_visitorId_createdAt_idx" ON "Metric"("websiteId", "visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "Metric_contentId_type_createdAt_idx" ON "Metric"("contentId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Metric_dedupeKey_idx" ON "Metric"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "BlogPost_authorId_idx" ON "BlogPost"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "IndexState_url_key" ON "IndexState"("url");

-- CreateIndex
CREATE INDEX "IndexState_domain_idx" ON "IndexState"("domain");

-- CreateIndex
CREATE INDEX "IndexState_isIndexed_idx" ON "IndexState"("isIndexed");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_resendSyncStatus_idx" ON "NewsletterSubscriber"("resendSyncStatus");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_createdAt_idx" ON "NewsletterSubscriber"("createdAt");

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

-- CreateIndex
CREATE UNIQUE INDEX "NibShareReceipt_paymentNonce_shareId_key" ON "NibShareReceipt"("paymentNonce", "shareId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherIdentity" ADD CONSTRAINT "PublisherIdentity_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "PublisherIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnlockReceipt" ADD CONSTRAINT "UnlockReceipt_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnlockReceipt" ADD CONSTRAINT "UnlockReceipt_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnlockReceipt" ADD CONSTRAINT "UnlockReceipt_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "PublisherIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEvent" ADD CONSTRAINT "ContentEvent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRating" ADD CONSTRAINT "ContentRating_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRating" ADD CONSTRAINT "ContentRating_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRating" ADD CONSTRAINT "ContentRating_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "PublisherIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "PublisherIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NibShareEntitlement" ADD CONSTRAINT "NibShareEntitlement_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NibShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NibShareEvent" ADD CONSTRAINT "NibShareEvent_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NibShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NibShareReceipt" ADD CONSTRAINT "NibShareReceipt_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "NibShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

