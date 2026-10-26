-- Additive encrypted multi-vault storage. The existing active vault and all
-- project/financial records remain in place and unchanged.
CREATE TABLE "PrivateVaultStored" (
  "vaultId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "recoveryEnvelope" JSONB NOT NULL,
  "passkey" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivateVaultStored_pkey" PRIMARY KEY ("vaultId")
);
CREATE INDEX "PrivateVaultStored_userId_createdAt_idx" ON "PrivateVaultStored"("userId", "createdAt");
