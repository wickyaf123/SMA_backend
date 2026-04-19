-- Add new IssueCategory enum values for the silent-failure hardening pass.
-- Postgres allows ALTER TYPE ... ADD VALUE in a transaction on PG12+ as long
-- as the new value isn't referenced in the same transaction; we only add
-- here, so grouping is safe.
ALTER TYPE "IssueCategory" ADD VALUE IF NOT EXISTS 'TOOL_EXECUTION_FAILED';
ALTER TYPE "IssueCategory" ADD VALUE IF NOT EXISTS 'STUCK_JOB_RECOVERED';
ALTER TYPE "IssueCategory" ADD VALUE IF NOT EXISTS 'CLAY_WEBHOOK_TIMEOUT';
