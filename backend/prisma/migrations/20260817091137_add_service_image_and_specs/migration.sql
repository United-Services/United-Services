-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "imageS3Key" TEXT,
ADD COLUMN     "specs" TEXT[] DEFAULT ARRAY[]::TEXT[];
