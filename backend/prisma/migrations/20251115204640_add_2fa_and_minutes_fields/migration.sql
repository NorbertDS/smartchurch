-- AlterTable
ALTER TABLE "BoardMinute" ADD COLUMN "approvalSignature" TEXT;
ALTER TABLE "BoardMinute" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "BoardMinute" ADD COLUMN "expiresAt" DATETIME;

-- AlterTable
ALTER TABLE "BusinessMinute" ADD COLUMN "approvalSignature" TEXT;
ALTER TABLE "BusinessMinute" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "BusinessMinute" ADD COLUMN "businessType" TEXT;
ALTER TABLE "BusinessMinute" ADD COLUMN "expiresAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "role", "updatedAt") SELECT "createdAt", "email", "id", "name", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
