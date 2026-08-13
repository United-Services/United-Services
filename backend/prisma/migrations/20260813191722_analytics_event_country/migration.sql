-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "country" TEXT;

-- CreateIndex
CREATE INDEX "AnalyticsEvent_country_idx" ON "AnalyticsEvent"("country");
