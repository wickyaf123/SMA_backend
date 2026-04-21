-- Close chat cross-user leak: Conversation.userId becomes required.
-- Orphan conversations (userId IS NULL) were visible to every authenticated
-- user and auto-adopted by the first requester. They are deleted here and
-- the column is tightened to NOT NULL so the leak cannot reappear.

BEGIN;

-- 1. Delete ChatTurn rows whose conversation is orphaned.
--    ChatTurn has no Prisma @relation to Conversation, so no DB cascade fires.
--    Deleting the turn cascades to ToolExecution and TurnEvent (FK ON DELETE CASCADE).
DELETE FROM "ChatTurn"
WHERE "conversationId" IN (SELECT "id" FROM "Conversation" WHERE "userId" IS NULL);

-- 2. Delete Workflow rows tied to orphans. Cascades to WorkflowStep.
DELETE FROM "Workflow"
WHERE "conversationId" IN (SELECT "id" FROM "Conversation" WHERE "userId" IS NULL);

-- 3. Null-out optional back-references on rows that should survive orphan deletion.
UPDATE "PermitSearch"
SET "conversationId" = NULL
WHERE "conversationId" IN (SELECT "id" FROM "Conversation" WHERE "userId" IS NULL);

UPDATE "IssueEvent"
SET "conversationId" = NULL
WHERE "conversationId" IN (SELECT "id" FROM "Conversation" WHERE "userId" IS NULL);

-- 4. Delete orphan conversations. Cascades to Message -> MessageFeedback.
DELETE FROM "Conversation" WHERE "userId" IS NULL;

-- 5. Replace the existing FK (ON DELETE SET NULL) with RESTRICT so the
--    column can become NOT NULL. SET NULL is incompatible with NOT NULL
--    and, more importantly, a deleted User would have silently orphaned
--    their conversations again — the exact class of bug this migration
--    closes. RESTRICT means user deletion must be explicit about chat
--    cleanup.
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_userId_fkey";

-- 6. Tighten the schema so orphans can never reappear.
ALTER TABLE "Conversation" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
