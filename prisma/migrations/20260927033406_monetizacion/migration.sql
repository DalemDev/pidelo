-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '/',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "visibleAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("body", "createdAt", "id", "link", "read", "title", "userId") SELECT "body", "createdAt", "id", "link", "read", "title", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE TABLE "new_Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "price" REAL NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "feeRate" REAL NOT NULL DEFAULT 0.1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    CONSTRAINT "Offer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Offer_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Offer" ("createdAt", "deliveryDays", "id", "message", "price", "providerId", "requestId", "status") SELECT "createdAt", "deliveryDays", "id", "message", "price", "providerId", "requestId", "status" FROM "Offer";
DROP TABLE "Offer";
ALTER TABLE "new_Offer" RENAME TO "Offer";
CREATE UNIQUE INDEX "Offer_requestId_providerId_key" ON "Offer"("requestId", "providerId");
CREATE TABLE "new_Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RESOLVER',
    "budgetMin" REAL,
    "budgetMax" REAL,
    "deadline" DATETIME,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "modality" TEXT NOT NULL DEFAULT 'CUALQUIERA',
    "city" TEXT NOT NULL DEFAULT 'Todo Ecuador',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "escrow" TEXT NOT NULL DEFAULT 'NONE',
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "featuredUntil" DATETIME,
    "bumpedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "premiumUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "authorId" TEXT NOT NULL,
    "acceptedOfferId" TEXT,
    CONSTRAINT "Request_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Request_acceptedOfferId_fkey" FOREIGN KEY ("acceptedOfferId") REFERENCES "Offer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("acceptedOfferId", "authorId", "budgetMax", "budgetMin", "category", "city", "createdAt", "deadline", "description", "escrow", "id", "kind", "modality", "notifiedCount", "status", "title", "updatedAt", "urgent", "views") SELECT "acceptedOfferId", "authorId", "budgetMax", "budgetMin", "category", "city", "createdAt", "deadline", "description", "escrow", "id", "kind", "modality", "notifiedCount", "status", "title", "updatedAt", "urgent", "views" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE UNIQUE INDEX "Request_acceptedOfferId_key" ON "Request"("acceptedOfferId");
CREATE INDEX "Request_status_createdAt_idx" ON "Request"("status", "createdAt");
CREATE INDEX "Request_category_idx" ON "Request"("category");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Todo Ecuador',
    "bio" TEXT NOT NULL DEFAULT '',
    "skills" TEXT NOT NULL DEFAULT '',
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "suspendedUntil" DATETIME,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "planRenewsAt" DATETIME,
    "planAutoRenew" BOOLEAN NOT NULL DEFAULT true,
    "creditsGrantedAt" DATETIME,
    "offerTemplate" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("bio", "city", "createdAt", "email", "id", "name", "passwordHash", "skills", "strikes", "suspendedUntil") SELECT "bio", "city", "createdAt", "email", "id", "name", "passwordHash", "skills", "strikes", "suspendedUntil" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");
