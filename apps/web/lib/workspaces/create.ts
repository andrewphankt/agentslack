import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";

/** Creates a workspace with `creatorUserId` as its owner member. */
export async function createWorkspaceWithOwner(creatorUserId: string, name: string) {
  const ws = await prisma.workspace.create({
    data: { name, inviteCode: randomBytes(5).toString("hex") },
  });
  await prisma.workspaceMember.create({
    data: {
      workspaceId: ws.id,
      userId: creatorUserId,
      displayName: creatorUserId,
      role: "owner",
      contextToken: randomBytes(24).toString("hex"),
      agentConfig: {
        agent_id: `${creatorUserId}-agent`,
        name: `${creatorUserId}'s Agent`,
        type: "custom",
        capabilities: [],
      },
    },
  });
  await broadcastWorkspaceEvent(ws.id, {
    type: "member_joined",
    payload: { user_id: creatorUserId, workspace_id: ws.id },
  });
  return ws;
}
