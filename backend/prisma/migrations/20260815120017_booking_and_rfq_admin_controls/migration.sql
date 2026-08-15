-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('booked', 'done', 'cancelled');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "status" "AppointmentStatus" NOT NULL DEFAULT 'booked';

-- AlterTable
ALTER TABLE "AppointmentSlot" ADD COLUMN     "isClosed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "contactedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");
