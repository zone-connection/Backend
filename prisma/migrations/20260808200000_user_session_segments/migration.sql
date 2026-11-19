-- CreateTable
CREATE TABLE "user_session_segments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_session_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_session_segments_tenantId_dateKey_idx" ON "user_session_segments"("tenantId", "dateKey");

-- CreateIndex
CREATE INDEX "user_session_segments_userId_dateKey_idx" ON "user_session_segments"("userId", "dateKey");

-- CreateIndex
CREATE INDEX "user_session_segments_userId_endedAt_idx" ON "user_session_segments"("userId", "endedAt");

-- AddForeignKey
ALTER TABLE "user_session_segments" ADD CONSTRAINT "user_session_segments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_session_segments" ADD CONSTRAINT "user_session_segments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
