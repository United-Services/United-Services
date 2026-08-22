-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('technical', 'disabled_account', 'non_technical');

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "type" "TicketType" NOT NULL,
    "details" TEXT NOT NULL,
    "screenshotS3Key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_type_createdAt_idx" ON "Ticket"("type", "createdAt");
