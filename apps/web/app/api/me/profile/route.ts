import { NextResponse } from "next/server";
import { actorUserIdFromRequest } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Change the name or picture everyone sees for you, in every room you are in. */
export async function PATCH(req: Request) {
  let me: string;
  try {
    me = await actorUserIdFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; picture?: unknown };
  if (typeof body.picture === "string") {
    // A small square picture, made in the browser.
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.picture) || body.picture.length > 120_000)
      return NextResponse.json({ error: "That picture did not work. Try another one." }, { status: 400 });
    await prisma.user.updateMany({ where: { id: me }, data: { avatarUrl: body.picture } });
    const inRooms = await prisma.workspaceMember.findMany({ where: { userId: me }, select: { workspaceId: true } });
    await Promise.all(
      inRooms.flatMap((r) => [
        broadcastWorkspaceEvent(r.workspaceId, { type: "members_changed" }).catch(() => {}),
        broadcastWorkspaceEvent(r.workspaceId, { type: "agents_changed" }).catch(() => {}),
      ])
    );
    return NextResponse.json({ ok: true });
  }
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  if (!name) return NextResponse.json({ error: "Type a name." }, { status: 400 });

  await prisma.user.updateMany({ where: { id: me }, data: { displayName: name } });
  const rooms = await prisma.workspaceMember.findMany({ where: { userId: me }, select: { workspaceId: true } });
  await prisma.workspaceMember.updateMany({ where: { userId: me }, data: { displayName: name } });
  await Promise.all(
    rooms.map((r) => broadcastWorkspaceEvent(r.workspaceId, { type: "chat_channels_changed" }).catch(() => {}))
  );
  return NextResponse.json({ name });
}
