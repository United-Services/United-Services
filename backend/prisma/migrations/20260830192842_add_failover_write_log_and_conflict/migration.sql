-- CreateTable
CREATE TABLE "FailoverWriteLog" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "primaryKey" TEXT NOT NULL,
    "payload" JSONB,
    "writtenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" TIMESTAMP(3),

    CONSTRAINT "FailoverWriteLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailoverConflict" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "primaryKeyId" TEXT NOT NULL,
    "localPayload" JSONB NOT NULL,
    "primaryPayload" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FailoverConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FailoverWriteLog_reconciledAt_writtenAt_idx" ON "FailoverWriteLog"("reconciledAt", "writtenAt");

-- CreateIndex
CREATE INDEX "FailoverConflict_resolvedAt_detectedAt_idx" ON "FailoverConflict"("resolvedAt", "detectedAt");
