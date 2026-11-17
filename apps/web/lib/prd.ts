import { randomUUID } from "crypto";
import type { Agent } from "@prisma/client";
import { agentLabel } from "@/lib/agents";
import { displayNames } from "@/lib/chat";
import { ensureUpdates } from "@/lib/hooks";
import { prisma } from "@/lib/prisma";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";

export const PRD_MAX = 3000;

/** Post an agent's short project summary into the room's #updates channel, as the plan. */
export async function postPrd(agent: Agent, body: string): Promise<void> {
  const names = await displayNames(agent.workspaceId);
  const channel = await ensureUpdates(agent.workspaceId);
  const row = await prisma.collaborationMessage.create({
    data: {
      workspaceId: agent.workspaceId,
      channelId: channel.id,
      authorAgentId: agent.id,
      authorUserId: null,
      type: "prd",
      fromAgent: agentLabel(agent, names),
      toTarget: "#updates",
      content: { text: body },
      messageId: randomUUID(),
    },
  });
  await broadcastWorkspaceEvent(agent.workspaceId, {
    type: "chat_message",
    channelId: channel.id,
    messageId: row.id,
  });
}
