-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('WORKFLOW_UI_MISSING', 'SILENT_EMPTY_RESULT', 'STATE_RACE_DETECTED', 'SOCKET_EVENT_DROPPED', 'PIPELINE_TIER_EXHAUSTED', 'RELEVANCE_FILTER_ALL_REJECTED', 'HOMEOWNER_FALLBACK_FAILED', 'WORKFLOW_MISSING_CONVERSATION_ID');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "IssueEvent" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "category" "IssueCategory" NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'WARN',
    "conversationId" TEXT,
    "turnId" TEXT,
    "workflowId" TEXT,
    "jobId" TEXT,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueEvent_category_createdAt_idx" ON "IssueEvent"("category", "createdAt");

-- CreateIndex
CREATE INDEX "IssueEvent_conversationId_createdAt_idx" ON "IssueEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "IssueEvent_createdAt_idx" ON "IssueEvent"("createdAt");
