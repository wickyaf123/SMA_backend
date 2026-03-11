-- Add separate GHL workflow IDs for email and SMS replies
ALTER TABLE "Settings" ADD COLUMN "permitGhlEmailReplyWorkflowId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "permitGhlSmsReplyWorkflowId" TEXT;
