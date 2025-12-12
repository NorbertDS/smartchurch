-- CreateTable
CREATE TABLE "MemberMinistry" (
    "memberId" INTEGER NOT NULL,
    "ministryId" INTEGER NOT NULL,
    "role" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("memberId", "ministryId"),
    CONSTRAINT "MemberMinistry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberMinistry_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
