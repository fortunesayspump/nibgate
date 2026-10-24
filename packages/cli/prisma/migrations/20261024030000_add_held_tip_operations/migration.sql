-- Durable claim/refund serialization and one-shot refund authorizations.
-- Reservations have no TTL because a crashed request may have submitted an
-- on-chain transaction whose outcome must be reconciled before retrying.
CREATE TABLE "TipDomainOperation" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'reserved',
    "transactionHash" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TipDomainOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TipDomainOperation_network_domain_key" ON "TipDomainOperation"("network", "domain");

CREATE TABLE "TipRefundAuthorization" (
    "digest" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "amountUnits" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refundTipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TipRefundAuthorization_pkey" PRIMARY KEY ("digest")
);
CREATE INDEX "TipRefundAuthorization_network_domain_wallet_idx" ON "TipRefundAuthorization"("network", "domain", "wallet");
