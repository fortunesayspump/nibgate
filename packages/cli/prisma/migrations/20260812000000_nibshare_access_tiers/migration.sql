-- NibShare: whitelist pricing tiers + invite-only (publicAccess=false)
ALTER TABLE "NibShare" ADD COLUMN "whitelistPrice" DOUBLE PRECISION;
ALTER TABLE "NibShare" ADD COLUMN "publicAccess" BOOLEAN NOT NULL DEFAULT true;

-- Pre-existing whitelist shares used "non-empty whitelist = invite-only".
-- Preserve that: those stay invite-only under the new model.
UPDATE "NibShare" SET "publicAccess" = false WHERE "whitelist" IS NOT NULL AND CARDINALITY("whitelist") > 0;

-- NibShareEntitlement: banned status (hard block; revoked = soft, may re-pay)
-- (status is a free-text column; nothing to migrate structurally)

-- NibShareReceipt: refund tracking for soft revokes
ALTER TABLE "NibShareReceipt" ADD COLUMN "refundedAt" TIMESTAMP(3);
