import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { errStatus } from "@/lib/chat";

type Ctx = { params: { wsId: string; channelId: string } };

/** The three every room starts with. Agents post to them by name, so they stay. */
const CORE = new Set(["general", "updates", "prd", "changes"]);

async function load(req: Request, ctx: Ctx) {
  const { wsId, channelId } = ctx.params;
  try {
    await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return { res: NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) }) };
  }
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId: wsId, kind: "channel" } });
  if (!channel) return { res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (CORE.has(channel.name)) {
    return { res: NextResponse.json({ error: "This channel comes with the room and stays." }, { status: 400 }) };
  }
  return { channel };
}

/** Rename a channel. */
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (!r.channel) return r.res;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const slug = String(body.name ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
  if (!slug) return NextResponse.json({ error: "Type a name." }, { status: 400 });
  if (slug !== r.channel.name) {
    const taken = await prisma.channel.findFirst({
      where: { workspaceId: ctx.params.wsId, kind: "channel", name: slug },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ error: "There is already a channel with that name." }, { status: 409 });
    await prisma.channel.update({ where: { id: r.channel.id }, data: { name: slug } });
    await broadcastWorkspaceEvent(ctx.params.wsId, { type: "chat_channels_changed" });
  }
  return NextResponse.json({ name: slug });
}

/** Delete a channel and everything posted in it. */
export async function DELETE(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (!r.channel) return r.res;
  await prisma.channel.delete({ where: { id: r.channel.id } });
  await broadcastWorkspaceEvent(ctx.params.wsId, { type: "chat_channels_changed" });
  return NextResponse.json({ ok: true });
}
