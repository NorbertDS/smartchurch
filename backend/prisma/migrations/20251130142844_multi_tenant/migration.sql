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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Announcement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Announcement" ("audience", "content", "createdAt", "createdById", "id", "tenantId", "title") SELECT "audience", "content", "createdAt", "createdById", "id", "tenantId", "title" FROM "Announcement";
DROP TABLE "Announcement";
ALTER TABLE "new_Announcement" RENAME TO "Announcement";
CREATE TABLE "new_AttendanceEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "attendanceRecordId" INTEGER NOT NULL,
    "memberId" INTEGER,
    "eventId" INTEGER,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "AttendanceEntry_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AttendanceEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceEntry" ("attendanceRecordId", "eventId", "id", "memberId", "present", "tenantId") SELECT "attendanceRecordId", "eventId", "id", "memberId", "present", "tenantId" FROM "AttendanceEntry";
DROP TABLE "AttendanceEntry";
ALTER TABLE "new_AttendanceEntry" RENAME TO "AttendanceEntry";
CREATE TABLE "new_AttendanceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "serviceType" TEXT,
    "departmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "AttendanceRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AttendanceRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("createdAt", "date", "departmentId", "id", "serviceType", "tenantId") SELECT "createdAt", "date", "departmentId", "id", "serviceType", "tenantId" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "BoardMinute_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinute_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BoardMinute" ("agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "tenantId", "textContent", "title", "updatedAt", "updatedById", "version") SELECT "agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "tenantId", "textContent", "title", "updatedAt", "updatedById", "version" FROM "BoardMinute";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "BoardMinuteVersion_minuteId_fkey" FOREIGN KEY ("minuteId") REFERENCES "BoardMinute" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BoardMinuteVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BoardMinuteVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BoardMinuteVersion" ("changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "tenantId", "version") SELECT "changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "tenantId", "version" FROM "BoardMinuteVersion";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "BusinessMinute_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinute_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BusinessMinute" ("agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "businessType", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "tenantId", "textContent", "title", "updatedAt", "updatedById", "version") SELECT "agendaTopics", "approvalSignature", "approved", "approvedAt", "approvedById", "archivedAt", "businessType", "createdAt", "createdById", "expiresAt", "filePath", "format", "id", "meetingDate", "tenantId", "textContent", "title", "updatedAt", "updatedById", "version" FROM "BusinessMinute";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "BusinessMinuteVersion_minuteId_fkey" FOREIGN KEY ("minuteId") REFERENCES "BusinessMinute" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinuteVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessMinuteVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BusinessMinuteVersion" ("changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "tenantId", "version") SELECT "changeNote", "createdAt", "createdById", "filePath", "id", "minuteId", "tenantId", "version" FROM "BusinessMinuteVersion";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "CellGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CellGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CellGroup" ("createdAt", "createdById", "description", "id", "location", "name", "tenantId", "updatedAt") SELECT "createdAt", "createdById", "description", "id", "location", "name", "tenantId", "updatedAt" FROM "CellGroup";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "CellGroupContribution_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CellGroupMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellGroupContribution_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CellGroupContribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CellGroupContribution" ("amount", "createdById", "date", "id", "membershipId", "notes", "tenantId") SELECT "amount", "createdById", "date", "id", "membershipId", "notes", "tenantId" FROM "CellGroupContribution";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "CellGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CellGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellGroupMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellGroupMembership_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CellGroupMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CellGroupMembership" ("groupId", "id", "leftAt", "memberId", "notes", "registeredAt", "registeredById", "tenantId") SELECT "groupId", "id", "leftAt", "memberId", "notes", "registeredAt", "registeredById", "tenantId" FROM "CellGroupMembership";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Committee_chairMemberId_fkey" FOREIGN KEY ("chairMemberId") REFERENCES "Member" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Committee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Committee" ("chairMemberId", "createdAt", "id", "meetingFrequency", "name", "responsibilities", "tenantId", "updatedAt") SELECT "chairMemberId", "createdAt", "id", "meetingFrequency", "name", "responsibilities", "tenantId", "updatedAt" FROM "Committee";
DROP TABLE "Committee";
ALTER TABLE "new_Committee" RENAME TO "Committee";
CREATE UNIQUE INDEX "Committee_tenantId_name_key" ON "Committee"("tenantId", "name");
CREATE TABLE "new_CommitteeMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "committeeId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "role" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "CommitteeMember_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommitteeMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CommitteeMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CommitteeMember" ("committeeId", "id", "joinedAt", "memberId", "role", "tenantId") SELECT "committeeId", "id", "joinedAt", "memberId", "role", "tenantId" FROM "CommitteeMember";
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
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Council_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Council" ("contact", "createdAt", "description", "id", "meetingSchedule", "name", "tenantId", "updatedAt") SELECT "contact", "createdAt", "description", "id", "meetingSchedule", "name", "tenantId", "updatedAt" FROM "Council";
DROP TABLE "Council";
ALTER TABLE "new_Council" RENAME TO "Council";
CREATE UNIQUE INDEX "Council_tenantId_name_key" ON "Council"("tenantId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
