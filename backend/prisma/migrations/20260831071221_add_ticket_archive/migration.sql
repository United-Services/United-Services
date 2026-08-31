-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TicketArchive" (
    "id" TEXT NOT NULL,
    "originalTicketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "type" "TicketType" NOT NULL,
    "details" TEXT NOT NULL,
    "screenshotS3Key" TEXT,
    "screenshotDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "contactedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketArchive_originalTicketId_key" ON "TicketArchive"("originalTicketId");

-- CreateIndex
CREATE INDEX "TicketArchive_archivedAt_idx" ON "TicketArchive"("archivedAt");
