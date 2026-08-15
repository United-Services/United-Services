-- CreateEnum
CREATE TYPE "TranslatableContentType" AS ENUM ('open_position');

-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('missing', 'translating', 'translated', 'failed');

-- CreateTable
CREATE TABLE "ContentTranslation" (
    "id" TEXT NOT NULL,
    "contentType" "TranslatableContentType" NOT NULL,
    "contentId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "status" "TranslationStatus" NOT NULL DEFAULT 'missing',
    "fields" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "errorMessage" TEXT,
    "translatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentTranslation_status_idx" ON "ContentTranslation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTranslation_contentType_contentId_locale_key" ON "ContentTranslation"("contentType", "contentId", "locale");
