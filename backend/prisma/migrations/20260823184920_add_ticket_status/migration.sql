-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('unresolved', 'contacted', 'resolved');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "status" "TicketStatus" NOT NULL DEFAULT 'unresolved';

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
