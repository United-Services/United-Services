-- AlterTable
ALTER TABLE "CandidateApplication" ADD COLUMN     "documentsRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "documentsRequestedAt" TIMESTAMP(3),
ADD COLUMN     "documentsRequestedNote" TEXT,
ALTER COLUMN "idPhotoS3Key" DROP NOT NULL,
ALTER COLUMN "cvS3Key" DROP NOT NULL;
