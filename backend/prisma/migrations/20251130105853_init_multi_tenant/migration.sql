/*
  Warnings:

  - Added the required column `tenantId` to the `Announcement` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `AttendanceEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `AttendanceRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BoardMinute` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BoardMinuteVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BusinessMinute` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BusinessMinuteVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `CellGroup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `CellGroupContribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `CellGroupMembership` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Committee` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `CommitteeMember` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Council` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `CouncilMember` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Department` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `EventRegistration` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `FamilyRelation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `FinanceRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Member` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Program` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Sermon` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Setting` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Suggestion` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Tenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- Bootstrap default tenant for existing data
INSERT INTO "Tenant" ("id","name","slug","status","createdAt","updatedAt")
VALUES (1,'Default','default','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Announcement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audience" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Announcement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Announcement" ("audience", "content", "createdAt", "createdById", "id", "title") SELECT "audience", "content", "createdAt", "createdById", "id", "title" FROM "Announcement";
UPDATE "new_Announcement" SET "tenantId" = 1;
DROP TABLE "Announcement";
ALTER TABLE "new_Announcement" RENAME TO "Announcement";
CREATE TABLE "new_AttendanceEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "attendanceRecordId" INTEGER NOT NULL,
    "memberId" INTEGER,
    "eventId" INTEGER,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "AttendanceEntry_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AttendanceEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceEntry" ("attendanceRecordId", "eventId", "id", "memberId", "present") SELECT "attendanceRecordId", "eventId", "id", "memberId", "present" FROM "AttendanceEntry";
UPDATE "new_AttendanceEntry" SET "tenantId" = 1;
DROP TABLE "AttendanceEntry";
ALTER TABLE "new_AttendanceEntry" RENAME TO "AttendanceEntry";
CREATE TABLE "new_AttendanceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "serviceType" TEXT,
    "departmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "AttendanceRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("createdAt", "date", "departmentId", "id", "serviceType") SELECT "createdAt", "date", "departmentId", "id", "serviceType" FROM "AttendanceRecord";
UPDATE "new_AttendanceRecord" SET "tenantId" = 1;
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE TABLE "new_AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" INTEGER,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "entityId", "entityType", "id", "timestamp", "userId") SELECT "action", "entityId", "entityType", "id", "timestamp", "userId" FROM "AuditLog";
UPDATE "new_AuditLog" SET "tenantId" = 1 WHERE "tenantId" IS NULL;
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE TABLE "new_BoardMinute" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "meetingDate" DATETIME NOT NULL,
    "agendaTopics" TEXT,
    "filePath" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "textContent" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" DATETIME,
    "approvedById" INTEGER,
    "approvalSignature" TEXT,
    "expiresAt" DATETIME,
    "archivedAt" DATETIME,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BoardMinute_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinute_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BoardMinute" ("agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "textContent", "title", "updatedAt", "updatedById", "version") SELECT "agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "textContent", "title", "updatedAt", "updatedById", "version" FROM "BoardMinute";
UPDATE "new_BoardMinute" SET "tenantId" = 1;
DROP TABLE "BoardMinute";
ALTER TABLE "new_BoardMinute" RENAME TO "BoardMinute";
CREATE TABLE "new_BoardMinuteVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "minuteId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BoardMinuteVersion_minuteId_fkey" FOREIGN KEY ("minuteId") REFERENCES "BoardMinute" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BoardMinuteVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinuteVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BoardMinuteVersion" ("changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "version") SELECT "changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "version" FROM "BoardMinuteVersion";
UPDATE "new_BoardMinuteVersion" SET "tenantId" = 1;
DROP TABLE "BoardMinuteVersion";
ALTER TABLE "new_BoardMinuteVersion" RENAME TO "BoardMinuteVersion";
CREATE TABLE "new_BusinessMinute" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "meetingDate" DATETIME NOT NULL,
    "agendaTopics" TEXT,
    "filePath" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "textContent" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" DATETIME,
    "approvedById" INTEGER,
    "approvalSignature" TEXT,
    "businessType" TEXT,
    "expiresAt" DATETIME,
    "archivedAt" DATETIME,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BusinessMinute_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinute_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BusinessMinute" ("agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "businessType", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "textContent", "title", "updatedAt", "updatedById", "version") SELECT "agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "businessType", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "textContent", "title", "updatedAt", "updatedById", "version" FROM "BusinessMinute";
UPDATE "new_BusinessMinute" SET "tenantId" = 1;
DROP TABLE "BusinessMinute";
ALTER TABLE "new_BusinessMinute" RENAME TO "BusinessMinute";
CREATE TABLE "new_BusinessMinuteVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "minuteId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BusinessMinuteVersion_minuteId_fkey" FOREIGN KEY ("minuteId") REFERENCES "BusinessMinute" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinuteVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinuteVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BusinessMinuteVersion" ("changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "version") SELECT "changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "version" FROM "BusinessMinuteVersion";
UPDATE "new_BusinessMinuteVersion" SET "tenantId" = 1;
DROP TABLE "BusinessMinuteVersion";
ALTER TABLE "new_BusinessMinuteVersion" RENAME TO "BusinessMinuteVersion";
CREATE TABLE "new_CellGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CellGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CellGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CellGroup" ("createdAt", "createdById", "description", "id", "location", "name", "updatedAt") SELECT "createdAt", "createdById", "description", "id", "location", "name", "updatedAt" FROM "CellGroup";
UPDATE "new_CellGroup" SET "tenantId" = 1;
DROP TABLE "CellGroup";
ALTER TABLE "new_CellGroup" RENAME TO "CellGroup";
CREATE UNIQUE INDEX "CellGroup_tenantId_name_key" ON "CellGroup"("tenantId", "name");
CREATE TABLE "new_CellGroupContribution" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "membershipId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" INTEGER,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CellGroupContribution_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CellGroupMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellGroupContribution_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CellGroupContribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CellGroupContribution" ("amount", "createdById", "date", "id", "membershipId", "notes") SELECT "amount", "createdById", "date", "id", "membershipId", "notes" FROM "CellGroupContribution";
UPDATE "new_CellGroupContribution" SET "tenantId" = 1;
DROP TABLE "CellGroupContribution";
ALTER TABLE "new_CellGroupContribution" RENAME TO "CellGroupContribution";
CREATE TABLE "new_CellGroupMembership" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredById" INTEGER,
    "notes" TEXT,
    "leftAt" DATETIME,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CellGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CellGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellGroupMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellGroupMembership_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CellGroupMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CellGroupMembership" ("groupId", "id", "leftAt", "memberId", "notes", "registeredAt", "registeredById") SELECT "groupId", "id", "leftAt", "memberId", "notes", "registeredAt", "registeredById" FROM "CellGroupMembership";
UPDATE "new_CellGroupMembership" SET "tenantId" = 1;
DROP TABLE "CellGroupMembership";
ALTER TABLE "new_CellGroupMembership" RENAME TO "CellGroupMembership";
CREATE TABLE "new_Committee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "responsibilities" TEXT,
    "meetingFrequency" TEXT,
    "chairMemberId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Committee_chairMemberId_fkey" FOREIGN KEY ("chairMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Committee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Committee" ("chairMemberId", "createdAt", "id", "meetingFrequency", "name", "responsibilities", "updatedAt") SELECT "chairMemberId", "createdAt", "id", "meetingFrequency", "name", "responsibilities", "updatedAt" FROM "Committee";
UPDATE "new_Committee" SET "tenantId" = 1;
DROP TABLE "Committee";
ALTER TABLE "new_Committee" RENAME TO "Committee";
CREATE UNIQUE INDEX "Committee_tenantId_name_key" ON "Committee"("tenantId", "name");
CREATE TABLE "new_CommitteeMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "committeeId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "role" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CommitteeMember_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommitteeMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommitteeMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CommitteeMember" ("committeeId", "id", "joinedAt", "memberId", "role") SELECT "committeeId", "id", "joinedAt", "memberId", "role" FROM "CommitteeMember";
UPDATE "new_CommitteeMember" SET "tenantId" = 1;
DROP TABLE "CommitteeMember";
ALTER TABLE "new_CommitteeMember" RENAME TO "CommitteeMember";
CREATE UNIQUE INDEX "CommitteeMember_committeeId_memberId_key" ON "CommitteeMember"("committeeId", "memberId");
CREATE TABLE "new_Council" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contact" TEXT,
    "meetingSchedule" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Council_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Council" ("contact", "createdAt", "description", "id", "meetingSchedule", "name", "updatedAt") SELECT "contact", "createdAt", "description", "id", "meetingSchedule", "name", "updatedAt" FROM "Council";
UPDATE "new_Council" SET "tenantId" = 1;
DROP TABLE "Council";
ALTER TABLE "new_Council" RENAME TO "Council";
CREATE UNIQUE INDEX "Council_tenantId_name_key" ON "Council"("tenantId", "name");
CREATE TABLE "new_CouncilMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "councilId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "role" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "CouncilMember_councilId_fkey" FOREIGN KEY ("councilId") REFERENCES "Council" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CouncilMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CouncilMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CouncilMember" ("councilId", "id", "joinedAt", "memberId", "role") SELECT "councilId", "id", "joinedAt", "memberId", "role" FROM "CouncilMember";
UPDATE "new_CouncilMember" SET "tenantId" = 1;
DROP TABLE "CouncilMember";
ALTER TABLE "new_CouncilMember" RENAME TO "CouncilMember";
CREATE UNIQUE INDEX "CouncilMember_councilId_memberId_key" ON "CouncilMember"("councilId", "memberId");
CREATE TABLE "new_Department" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leaderId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Department_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Department" ("createdAt", "description", "id", "leaderId", "name", "updatedAt") SELECT "createdAt", "description", "id", "leaderId", "name", "updatedAt" FROM "Department";
UPDATE "new_Department" SET "tenantId" = 1;
DROP TABLE "Department";
ALTER TABLE "new_Department" RENAME TO "Department";
CREATE UNIQUE INDEX "Department_tenantId_name_key" ON "Department"("tenantId", "name");
CREATE TABLE "new_Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME NOT NULL,
    "location" TEXT,
    "departmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Event_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("createdAt", "date", "departmentId", "description", "id", "location", "title", "updatedAt") SELECT "createdAt", "date", "departmentId", "description", "id", "location", "title", "updatedAt" FROM "Event";
UPDATE "new_Event" SET "tenantId" = 1;
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE TABLE "new_EventRegistration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventRegistration_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EventRegistration" ("createdAt", "eventId", "id", "memberId", "status") SELECT "createdAt", "eventId", "id", "memberId", "status" FROM "EventRegistration";
UPDATE "new_EventRegistration" SET "tenantId" = 1;
DROP TABLE "EventRegistration";
ALTER TABLE "new_EventRegistration" RENAME TO "EventRegistration";
CREATE TABLE "new_FamilyRelation" (
    "parentId" INTEGER NOT NULL,
    "childId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,

    PRIMARY KEY ("parentId", "childId"),
    CONSTRAINT "FamilyRelation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FamilyRelation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FamilyRelation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FamilyRelation" ("childId", "createdAt", "parentId") SELECT "childId", "createdAt", "parentId" FROM "FamilyRelation";
UPDATE "new_FamilyRelation" SET "tenantId" = 1;
DROP TABLE "FamilyRelation";
ALTER TABLE "new_FamilyRelation" RENAME TO "FamilyRelation";
CREATE TABLE "new_FinanceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "memberId" INTEGER,
    "category" TEXT,
    "createdById" INTEGER,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "FinanceRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FinanceRecord" ("amount", "category", "createdById", "date", "description", "id", "memberId", "type") SELECT "amount", "category", "createdById", "date", "description", "id", "memberId", "type" FROM "FinanceRecord";
UPDATE "new_FinanceRecord" SET "tenantId" = 1;
DROP TABLE "FinanceRecord";
ALTER TABLE "new_FinanceRecord" RENAME TO "FinanceRecord";
CREATE TABLE "new_Member" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "demographicGroup" TEXT,
    "dob" DATETIME,
    "contact" TEXT,
    "address" TEXT,
    "spiritualStatus" TEXT,
    "dateJoined" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photoUrl" TEXT,
    "baptized" BOOLEAN NOT NULL DEFAULT false,
    "dedicated" BOOLEAN NOT NULL DEFAULT false,
    "weddingDate" DATETIME,
    "userId" INTEGER,
    "departmentId" INTEGER,
    "membershipNumber" TEXT,
    "membershipStatus" TEXT,
    "profession" TEXT,
    "talents" JSONB,
    "abilities" JSONB,
    "groupAffiliations" JSONB,
    "deletedAt" DATETIME,
    "deletedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Member_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Member" ("abilities", "address", "baptized", "contact", "createdAt", "dateJoined", "dedicated", "deletedAt", "deletedById", "demographicGroup", "departmentId", "dob", "firstName", "gender", "groupAffiliations", "id", "lastName", "membershipNumber", "membershipStatus", "photoUrl", "profession", "spiritualStatus", "talents", "updatedAt", "userId", "weddingDate") SELECT "abilities", "address", "baptized", "contact", "createdAt", "dateJoined", "dedicated", "deletedAt", "deletedById", "demographicGroup", "departmentId", "dob", "firstName", "gender", "groupAffiliations", "id", "lastName", "membershipNumber", "membershipStatus", "photoUrl", "profession", "spiritualStatus", "talents", "updatedAt", "userId", "weddingDate" FROM "Member";
UPDATE "new_Member" SET "tenantId" = 1;
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE UNIQUE INDEX "Member_userId_key" ON "Member"("userId");
CREATE UNIQUE INDEX "Member_membershipNumber_key" ON "Member"("membershipNumber");
CREATE TABLE "new_Program" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "location" TEXT,
    "status" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Program_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Program_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Program" ("createdAt", "createdById", "description", "endDate", "id", "location", "name", "startDate", "status", "updatedAt") SELECT "createdAt", "createdById", "description", "endDate", "id", "location", "name", "startDate", "status", "updatedAt" FROM "Program";
UPDATE "new_Program" SET "tenantId" = 1;
DROP TABLE "Program";
ALTER TABLE "new_Program" RENAME TO "Program";
CREATE TABLE "new_Sermon" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "speaker" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "contentUrl" TEXT,
    "textContent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Sermon_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sermon" ("contentUrl", "createdAt", "date", "id", "speaker", "textContent", "title", "type") SELECT "contentUrl", "createdAt", "date", "id", "speaker", "textContent", "title", "type" FROM "Sermon";
UPDATE "new_Sermon" SET "tenantId" = 1;
DROP TABLE "Sermon";
ALTER TABLE "new_Sermon" RENAME TO "Sermon";
CREATE TABLE "new_Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Setting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Setting" ("id", "key", "updatedAt", "value") SELECT "id", "key", "updatedAt", "value" FROM "Setting";
UPDATE "new_Setting" SET "tenantId" = 1;
DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";
CREATE UNIQUE INDEX "Setting_tenantId_key_key" ON "Setting"("tenantId", "key");
CREATE TABLE "new_Suggestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "contentHtml" TEXT NOT NULL,
    "attachmentPath" TEXT,
    "status" TEXT,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Suggestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Suggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Suggestion" ("attachmentPath", "category", "contentHtml", "createdAt", "createdById", "id", "status", "title") SELECT "attachmentPath", "category", "contentHtml", "createdAt", "createdById", "id", "status", "title" FROM "Suggestion";
UPDATE "new_Suggestion" SET "tenantId" = 1;
DROP TABLE "Suggestion";
ALTER TABLE "new_Suggestion" RENAME TO "Suggestion";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "role", "twoFactorEnabled", "twoFactorSecret", "updatedAt") SELECT "createdAt", "email", "id", "name", "passwordHash", "role", "twoFactorEnabled", "twoFactorSecret", "updatedAt" FROM "User";
UPDATE "new_User" SET "tenantId" = 1 WHERE "tenantId" IS NULL;
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
