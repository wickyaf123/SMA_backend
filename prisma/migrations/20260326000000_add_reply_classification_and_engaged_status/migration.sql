-- CreateEnum
CREATE TYPE "ReplyClassification" AS ENUM ('BOOK_CALL', 'MORE_INFO', 'NOT_INTERESTED', 'OBJECTION', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "ContactStatus" ADD VALUE 'ENGAGED' AFTER 'REPLIED';

-- AlterTable
ALTER TABLE "Reply" ADD COLUMN "classification" "ReplyClassification",
ADD COLUMN "classifiedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "Reply_classification_idx" ON "Reply"("classification");
