-- Add marketplace/indexing fields for Explore content.
ALTER TABLE "Content" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Content" ADD COLUMN "path" TEXT;
ALTER TABLE "Content" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USDC';
ALTER TABLE "Content" ADD COLUMN "lastSeenAt" DATETIME;

CREATE UNIQUE INDEX "Content_websiteId_externalId_key" ON "Content"("websiteId", "externalId");
CREATE UNIQUE INDEX "Content_websiteId_url_key" ON "Content"("websiteId", "url");
CREATE INDEX "Content_contentType_idx" ON "Content"("contentType");
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");
