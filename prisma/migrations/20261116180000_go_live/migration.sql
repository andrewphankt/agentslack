ALTER TABLE "Workspace" ADD COLUMN "previewUrl" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "liveUrl" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "lastLiveAt" TIMESTAMP(3);
ALTER TABLE "Workspace" ADD COLUMN "lastLiveBy" TEXT;
