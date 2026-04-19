-- Add diagnostics JSON to PermitSearch so success-path JOB_COMPLETED events
-- can surface "Found X of Y — Z filtered out by relevance scorer" in the UI.
ALTER TABLE "PermitSearch" ADD COLUMN "diagnostics" JSONB;
