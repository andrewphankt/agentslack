-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "intent" TEXT,
ADD COLUMN     "lastPromptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FileActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warnedAt" TIMESTAMP(3),

    CONSTRAINT "FileActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileActivity_agentId_path_key" ON "FileActivity"("agentId", "path");

-- CreateIndex
CREATE INDEX "FileActivity_workspaceId_path_idx" ON "FileActivity"("workspaceId", "path");

-- AddForeignKey
ALTER TABLE "FileActivity" ADD CONSTRAINT "FileActivity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
