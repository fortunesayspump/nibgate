-- Additive only. Apply through the reviewed migration workflow before cron rollout.
CREATE TABLE "BackgroundJobState" (
  "key" TEXT PRIMARY KEY,
  "owner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cursor" TEXT
);
