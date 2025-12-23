-- AlterTable
ALTER TABLE "User" ADD COLUMN "resetTokenExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;
