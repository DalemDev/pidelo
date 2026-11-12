-- AuthAttempt pasa a ser RateLimitEvent (límites de uso genéricos): se renombra para conservar los datos.
ALTER TABLE "AuthAttempt" RENAME TO "RateLimitEvent";
ALTER TABLE "RateLimitEvent" RENAME CONSTRAINT "AuthAttempt_pkey" TO "RateLimitEvent_pkey";
ALTER INDEX "AuthAttempt_kind_key_createdAt_idx" RENAME TO "RateLimitEvent_kind_key_createdAt_idx";

-- Las sesiones pasan a una tabla revocable (Session); sessionsValidAfter deja de usarse.
-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "resolvedById" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "processedById" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "sessionsValidAfter",
ADD COLUMN     "bankUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "ip" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_providerId_status_idx" ON "Offer"("providerId", "status");

-- CreateIndex
CREATE INDEX "Payment_requestId_idx" ON "Payment"("requestId");

-- CreateIndex
CREATE INDEX "Request_authorId_createdAt_idx" ON "Request"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

