-- CreateTable
CREATE TABLE "ContactLabel" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "contactId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactLabel_contactId_name_key" ON "ContactLabel"("contactId", "name");

-- CreateIndex
CREATE INDEX "ContactLabel_contactId_idx" ON "ContactLabel"("contactId");

-- AddForeignKey
ALTER TABLE "ContactLabel" ADD CONSTRAINT "ContactLabel_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "ContactStatus" ADD VALUE 'CUSTOMER';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "ghlPipelineId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "ghlDefaultStageId" TEXT;
