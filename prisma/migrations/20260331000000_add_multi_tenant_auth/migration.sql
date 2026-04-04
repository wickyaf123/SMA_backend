-- CreateTable: Session for refresh token management
CREATE TABLE "Session" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- AddColumn: userId to tenant-scoped models
ALTER TABLE "Contact" ADD COLUMN "userId" TEXT;
ALTER TABLE "Company" ADD COLUMN "userId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "userId" TEXT;
ALTER TABLE "CampaignRoutingRule" ADD COLUMN "userId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "userId" TEXT;
ALTER TABLE "PermitSearch" ADD COLUMN "userId" TEXT;
ALTER TABLE "Homeowner" ADD COLUMN "userId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "userId" TEXT;
ALTER TABLE "ImportJob" ADD COLUMN "userId" TEXT;
ALTER TABLE "MessageTemplate" ADD COLUMN "userId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "userId" TEXT;
ALTER TABLE "DailyMetrics" ADD COLUMN "userId" TEXT;

-- CreateIndex: Session indexes
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_refreshToken_idx" ON "Session"("refreshToken");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex: userId indexes on tenant-scoped models
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");
CREATE INDEX "Company_userId_idx" ON "Company"("userId");
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");
CREATE INDEX "CampaignRoutingRule_userId_idx" ON "CampaignRoutingRule"("userId");
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX "PermitSearch_userId_idx" ON "PermitSearch"("userId");
CREATE INDEX "Homeowner_userId_idx" ON "Homeowner"("userId");
CREATE INDEX "Settings_userId_idx" ON "Settings"("userId");
CREATE INDEX "ImportJob_userId_idx" ON "ImportJob"("userId");
CREATE INDEX "MessageTemplate_userId_idx" ON "MessageTemplate"("userId");
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE INDEX "DailyMetrics_userId_idx" ON "DailyMetrics"("userId");

-- AddForeignKey: Session -> User (cascade delete)
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: tenant-scoped models -> User (set null on delete)
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignRoutingRule" ADD CONSTRAINT "CampaignRoutingRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PermitSearch" ADD CONSTRAINT "PermitSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Homeowner" ADD CONSTRAINT "Homeowner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailyMetrics" ADD CONSTRAINT "DailyMetrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
