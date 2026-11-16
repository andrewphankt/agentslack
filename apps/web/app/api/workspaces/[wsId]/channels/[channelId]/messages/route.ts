import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { canSee, displayNames, errStatus } from "@/lib/chat";

type Ctx = { params: { wsId: string; channelId: string } };

async function load(req: Request, ctx: Ctx) {
  const { wsId, channelId } = ctx.params;
  let userId: string;
  try {
    userId = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return {
      res: NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) }),
    };
  }
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, workspaceId: wsId },
  });
  if (!channel) {
    return { res: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (!canSee(channel, userId)) {
    return { res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: { userId, channel } };
}

function shape(
  m: { id: string; authorUserId: string | null; content: unknown; createdAt: Date },
  names: Map<string, string>
) {
  const text = (m.content as { text?: unknown } | null)?.text;
  return {
    id: m.id,
    authorUserId: m.authorUserId,
    authorName:
      (m.authorUserId && names.get(m.authorUserId)) || m.authorUserId || "unknown",
    text: typeof text === "string" ? text : "",
    createdAt: m.createdAt.toISOString(),
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (!r.ok) return r.res;
  const { channel } = r.ok;
  const afterRaw = new URL(req.url).searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : null;
  if (after && isNaN(after.getTime())) {
    return NextResponse.json({ error: "Bad after" }, { status: 400 });
  }
  const names = await displayNames(ctx.params.wsId);
  const rows = after
    ? await prisma.collaborationMessage.findMany({
        where: { channelId: channel.id, createdAt: { gt: after } },
        orderBy: { createdAt: "asc" },
        take: 200,
      })
    : (
        await prisma.collaborationMessage.findMany({
          where: { channelId: channel.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      ).reverse();
  return NextResponse.json({ messages: rows.map((m) => shape(m, names)) });
}

export async function POST(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (!r.ok) return r.res;
  const { userId, channel } = r.ok;
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) {
    return NextResponse.json(
      { error: "Text must be 1-4000 characters" },
      { status: 400 }
    );
  }
  const row = await prisma.collaborationMessage.create({
    data: {
      workspaceId: ctx.params.wsId,
      channelId: channel.id,
      authorUserId: userId,
      type: "chat",
      fromAgent: userId,
      toTarget: channel.kind === "dm" ? "dm" : "#" + channel.name,
      content: { text },
      messageId: randomUUID(),
    },
  });
  // No text in the broadcast: DMs stay private, clients refetch over HTTP.
  await broadcastWorkspaceEvent(ctx.params.wsId, {
    type: "chat_message",
    channelId: channel.id,
    messageId: row.id,
  });
  const names = await displayNames(ctx.params.wsId);
  return NextResponse.json({ message: shape(row, names) });
}
