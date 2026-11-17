import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { canSee, displayNames, errStatus } from "@/lib/chat";

/** "Someone is typing here." Nothing is stored; the room just passes it on. */
export async function POST(req: Request, ctx: { params: { wsId: string; channelId: string } }) {
  const { wsId, channelId } = ctx.params;
  let userId: string;
  try {
    userId = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId: wsId } });
  if (!channel || !canSee(channel, userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const name = (await displayNames(wsId)).get(userId) ?? "Someone";
  await broadcastWorkspaceEvent(wsId, { type: "typing", channelId, userId, name });
  return NextResponse.json({ ok: true });
}
