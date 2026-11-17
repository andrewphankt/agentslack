import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { avatarUrls, displayNames, ensureGeneral, errStatus } from "@/lib/chat";

type Ch = { id: string; kind: string; name: string; memberIds: string[] };

function view(c: Ch, me: string, names: Map<string, string>) {
  const other = c.memberIds.find((id) => id !== me) ?? me;
  return {
    id: c.id,
    kind: c.kind,
    name: c.name,
    title: c.kind === "dm" ? names.get(other) ?? other : c.name,
  };
}

export async function GET(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  await ensureGeneral(wsId);
  const [rows, names, members] = await Promise.all([
    prisma.channel.findMany({
      where: {
        workspaceId: wsId,
        OR: [{ kind: "channel" }, { kind: "dm", memberIds: { has: me } }],
      },
      orderBy: { createdAt: "asc" },
    }),
    displayNames(wsId),
    prisma.workspaceMember.findMany({
      where: { workspaceId: wsId },
      select: { userId: true, role: true },
    }),
  ]);
  const avatars = await avatarUrls(members.map((m) => m.userId));
  return NextResponse.json({
    me,
    members: members.map((m) => ({
      avatarUrl: avatars.get(m.userId) ?? null,
      userId: m.userId,
      name: names.get(m.userId) ?? m.userId,
      role: m.role,
    })),
    channels: rows.map((c) => view(c, me, names)),
  });
}

export async function POST(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    userId?: string;
    /** A brand new channel: never reuse one that has this name, add a number instead. */
    fresh?: boolean;
  };

  let channel: Ch;
  if (typeof body.userId === "string" && body.userId) {
    const other = body.userId;
    if (other === me) {
      return NextResponse.json({ error: "Cannot DM yourself" }, { status: 400 });
    }
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: wsId, userId: other },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Not a workspace member" }, { status: 400 });
    }
    const ids = [me, other].sort();
    channel = await prisma.channel.upsert({
      where: {
        workspaceId_kind_name: { workspaceId: wsId, kind: "dm", name: ids.join(":") },
      },
      update: {},
      create: { workspaceId: wsId, kind: "dm", name: ids.join(":"), memberIds: ids },
    });
  } else {
    let slug = String(body.name ?? "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
    if (!slug) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    if (body.fresh) {
      const taken = new Set(
        (await prisma.channel.findMany({ where: { workspaceId: wsId, kind: "channel" }, select: { name: true } })).map((c) => c.name)
      );
      const base = slug.slice(0, 36);
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    }
    channel = await prisma.channel.upsert({
      where: {
        workspaceId_kind_name: { workspaceId: wsId, kind: "channel", name: slug },
      },
      update: {},
      create: { workspaceId: wsId, kind: "channel", name: slug },
    });
  }

  const names = await displayNames(wsId);
  await broadcastWorkspaceEvent(wsId, { type: "chat_channels_changed" });
  return NextResponse.json({ channel: view(channel, me, names) });
}
