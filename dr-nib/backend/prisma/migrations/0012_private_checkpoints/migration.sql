-- Old processing receipts keep NULL leases and cannot be automatically replayed.
ALTER TABLE "PrivateActionReceipt" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "PrivateActionReceipt" ADD COLUMN "leaseUntil" TIMESTAMP(3);
