import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { errStatus } from "@/lib/chat";

export async function DELETE(
  req: Request,
  ctx: { params: { wsId: string; agentId: string } }
) {
  const { wsId, agentId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, workspaceId: wsId },
  });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: wsId, userId: me },
    select: { role: true },
  });
  if (agent.ownerUserId !== me && member?.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.agent.delete({ where: { id: agent.id } });
  await broadcastWorkspaceEvent(wsId, { type: "agents_changed" });
  return NextResponse.json({ ok: true });
}
