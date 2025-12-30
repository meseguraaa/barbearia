-- CreateTable
CREATE TABLE "mobile_analytics_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "userId" TEXT,
    "unitId" TEXT,
    "context" JSONB,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mobile_analytics_events_name_createdAt_idx" ON "mobile_analytics_events"("name", "createdAt");

-- CreateIndex
CREATE INDEX "mobile_analytics_events_userId_createdAt_idx" ON "mobile_analytics_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "mobile_analytics_events_unitId_createdAt_idx" ON "mobile_analytics_events"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "mobile_analytics_events" ADD CONSTRAINT "mobile_analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_analytics_events" ADD CONSTRAINT "mobile_analytics_events_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
