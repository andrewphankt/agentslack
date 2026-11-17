import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { errStatus } from "@/lib/chat";
import { ensureChannel } from "@/lib/hooks";
import { SETUP_HOSTS, setupPrompt } from "@/lib/previewSetup";

/**
 * Leaves a request for the caller's own agent. The room cannot wake an agent, so the
 * request waits in #changes and is handed over at the start of the agent's next turn.
 */
export async function POST(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const body = (await req.json().catch(() => ({}))) as { host?: unknown };
  const host = typeof body.host === "string" ? body.host : "";
  const request = setupPrompt(host);
  if (!request) return NextResponse.json({ error: "Pick a host first" }, { status: 400 });
  const mine = await prisma.agent.count({ where: { workspaceId: wsId, ownerUserId: me } });
  if (!mine) return NextResponse.json({ error: "Connect your agent to the room first" }, { status: 400 });

  // Pressing the button twice must not queue the job twice: one waiting request is enough.
  const waiting = await prisma.collaborationMessage.findMany({
    where: {
      workspaceId: wsId,
      type: "chat",
      authorUserId: me,
      createdAt: { gt: new Date(Date.now() - 24 * 3600_000) },
      content: { path: ["forOwner"], equals: me },
    },
    select: { content: true },
  });
  if (waiting.some((m) => !(m.content as { deliveredAt?: unknown } | null)?.deliveredAt))
    return NextResponse.json({ ok: true, already: true });

  const channel = await ensureChannel(wsId, "changes");
  const row = await prisma.collaborationMessage.create({
    data: {
      workspaceId: wsId,
      channelId: channel.id,
      authorUserId: me,
      type: "chat",
      fromAgent: me,
      toTarget: "#changes",
      content: { text: host === "auto" ? "Asked their agent to set up the preview." : `Asked their agent to set up the ${SETUP_HOSTS[host]} preview.`, request, forOwner: me },
      messageId: randomUUID(),
    },
  });
  await broadcastWorkspaceEvent(wsId, { type: "chat_message", channelId: channel.id, messageId: row.id });
  return NextResponse.json({ ok: true });
}
