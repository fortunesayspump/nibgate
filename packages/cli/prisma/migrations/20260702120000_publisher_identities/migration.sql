-- Add multipublisher identity tracking for verified platform sites.
CREATE TABLE "PublisherIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "websiteId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "handle" TEXT,
  "name" TEXT,
  "walletAddress" TEXT,
  "profileUrl" TEXT,
  "verification" TEXT NOT NULL DEFAULT 'platform_attested',
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PublisherIdentity_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "Content" ADD COLUMN "publisherId" TEXT;
ALTER TABLE "Content" ADD COLUMN "publisherExternalId" TEXT;
ALTER TABLE "Content" ADD COLUMN "publisherHandle" TEXT;
ALTER TABLE "Content" ADD COLUMN "publisherWallet" TEXT;
ALTER TABLE "Content" ADD COLUMN "publisherProfileUrl" TEXT;
ALTER TABLE "Content" ADD COLUMN "publisherVerification" TEXT;
ALTER TABLE "UnlockReceipt" ADD COLUMN "publisherId" TEXT;
ALTER TABLE "ContentRating" ADD COLUMN "publisherId" TEXT;
ALTER TABLE "Metric" ADD COLUMN "publisherId" TEXT;

CREATE UNIQUE INDEX "PublisherIdentity_websiteId_externalId_key" ON "PublisherIdentity"("websiteId", "externalId");
CREATE INDEX "PublisherIdentity_websiteId_idx" ON "PublisherIdentity"("websiteId");
CREATE INDEX "PublisherIdentity_walletAddress_idx" ON "PublisherIdentity"("walletAddress");
CREATE INDEX "PublisherIdentity_handle_idx" ON "PublisherIdentity"("handle");
CREATE INDEX "Content_publisherId_idx" ON "Content"("publisherId");
CREATE INDEX "Content_publisherWallet_idx" ON "Content"("publisherWallet");
CREATE INDEX "UnlockReceipt_publisherId_idx" ON "UnlockReceipt"("publisherId");
CREATE INDEX "ContentRating_publisherId_idx" ON "ContentRating"("publisherId");
CREATE INDEX "Metric_publisherId_idx" ON "Metric"("publisherId");
