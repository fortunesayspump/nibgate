-- Additive encrypted records for measured Dr. Nib worker state. Apply only
-- after a separate migration review and rehearsal; no legacy row is changed.
CREATE TABLE "PrivateWorkerObject" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "envelope" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivateWorkerObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivateWorkerObject_runId_kind_objectId_revision_key"
    ON "PrivateWorkerObject"("runId", "kind", "objectId", "revision");
CREATE INDEX "PrivateWorkerObject_runId_kind_createdAt_idx"
    ON "PrivateWorkerObject"("runId", "kind", "createdAt");
ALTER TABLE "PrivateWorkerObject" ADD CONSTRAINT "PrivateWorkerObject_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "ResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
