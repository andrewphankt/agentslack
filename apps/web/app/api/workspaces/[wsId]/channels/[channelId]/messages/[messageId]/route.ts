import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { errStatus } from "@/lib/chat";

type Ctx = { params: { wsId: string; channelId: string; messageId: string } };

/** Only the person who wrote a message can change or remove it. Agent messages stay. */
async function load(req: Request, ctx: Ctx) {
  const { wsId, channelId, messageId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return { res: NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) }) };
  }
  const row = await prisma.collaborationMessage.findFirst({
    where: { id: messageId, workspaceId: wsId, channelId },
  });
  if (!row) return { res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (row.authorAgentId || row.authorUserId !== me) {
    return { res: NextResponse.json({ error: "You can only change your own messages." }, { status: 403 }) };
  }
  return { row };
}

const changed = (ctx: Ctx) =>
  broadcastWorkspaceEvent(ctx.params.wsId, { type: "chat_message_changed", channelId: ctx.params.channelId });

export async function PATCH(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (!r.row) return r.res;
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) {
    return NextResponse.json({ error: "Text must be 1-4000 characters" }, { status: 400 });
  }
  const old = (r.row.content ?? {}) as Record<string, unknown>;
  await prisma.collaborationMessage.update({
    where: { id: r.row.id },
    data: { content: { ...old, text, editedAt: new Date().toISOString() } },
  });
  await changed(ctx);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (!r.row) return r.res;
  await prisma.collaborationMessage.delete({ where: { id: r.row.id } });
  await changed(ctx);
  return NextResponse.json({ ok: true });
}
