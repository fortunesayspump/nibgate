-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN "videoUrl" TEXT,
ADD COLUMN "audioUrl" TEXT,
ADD COLUMN "media" TEXT,
ADD COLUMN "recipientWallet" TEXT,
ADD COLUMN "audioStorageRef" TEXT,
ADD COLUMN "audioEncryptedKey" TEXT,
ADD COLUMN "audioContentType" TEXT,
ADD COLUMN "contentKey" TEXT,
ADD COLUMN "bodyStorageRef" TEXT;
