import { randomUUID } from "crypto";
import type { Agent } from "@prisma/client";
import { agentLabel } from "@/lib/agents";
import { displayNames } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";

export const PRD_MAX = 3000;

/** Post an agent's short project summary into the room's #prd channel. */
export async function postPrd(agent: Agent, body: string): Promise<void> {
  const names = await displayNames(agent.workspaceId);
  const channel = await prisma.channel.upsert({
    where: {
      workspaceId_kind_name: { workspaceId: agent.workspaceId, kind: "channel", name: "prd" },
    },
    update: {},
    create: { workspaceId: agent.workspaceId, kind: "channel", name: "prd" },
  });
  const row = await prisma.collaborationMessage.create({
    data: {
      workspaceId: agent.workspaceId,
      channelId: channel.id,
      authorAgentId: agent.id,
      authorUserId: null,
      type: "prd",
      fromAgent: agentLabel(agent, names),
      toTarget: "#prd",
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
