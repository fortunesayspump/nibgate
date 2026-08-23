-- CreateTable
CREATE TABLE "PaymentTxClaim" (
    "txHash" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTxClaim_pkey" PRIMARY KEY ("txHash")
);
