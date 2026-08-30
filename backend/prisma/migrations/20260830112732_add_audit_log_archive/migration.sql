-- CreateTable
CREATE TABLE "AuditLogArchive" (
    "id" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditLogArchive_originalId_key" ON "AuditLogArchive"("originalId");

-- CreateIndex
CREATE INDEX "AuditLogArchive_createdAt_idx" ON "AuditLogArchive"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLogArchive_targetType_targetId_idx" ON "AuditLogArchive"("targetType", "targetId");
