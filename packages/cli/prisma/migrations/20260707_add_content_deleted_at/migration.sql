-- AlterTable: add deletedAt to Content for soft-delete support
ALTER TABLE "Content" ADD COLUMN "deletedAt" TIMESTAMPTZ;
