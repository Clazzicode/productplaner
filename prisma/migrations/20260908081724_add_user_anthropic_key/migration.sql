-- AlterTable
ALTER TABLE "User" ADD COLUMN     "anthropicApiKeyEncrypted" TEXT,
ADD COLUMN     "anthropicApiKeyUpdatedAt" TIMESTAMP(3);
