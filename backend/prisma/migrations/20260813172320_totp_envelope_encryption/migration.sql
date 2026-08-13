/*
  Warnings:

  - You are about to drop the column `secretEncrypted` on the `TotpCredential` table. All the data in the column will be lost.
  - Added the required column `totpAuthTag` to the `TotpCredential` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totpCiphertext` to the `TotpCredential` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totpKekKeyId` to the `TotpCredential` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totpNonce` to the `TotpCredential` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totpWrappedDek` to the `TotpCredential` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TotpCredential" DROP COLUMN "secretEncrypted",
ADD COLUMN     "totpAuthTag" TEXT NOT NULL,
ADD COLUMN     "totpCiphertext" TEXT NOT NULL,
ADD COLUMN     "totpKekKeyId" TEXT NOT NULL,
ADD COLUMN     "totpNonce" TEXT NOT NULL,
ADD COLUMN     "totpWrappedDek" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "KekRegistry" (
    "keyId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "KekRegistry_pkey" PRIMARY KEY ("keyId")
);

-- CreateIndex
CREATE INDEX "TotpCredential_totpKekKeyId_idx" ON "TotpCredential"("totpKekKeyId");

-- AddForeignKey
ALTER TABLE "TotpCredential" ADD CONSTRAINT "TotpCredential_totpKekKeyId_fkey" FOREIGN KEY ("totpKekKeyId") REFERENCES "KekRegistry"("keyId") ON DELETE RESTRICT ON UPDATE CASCADE;
