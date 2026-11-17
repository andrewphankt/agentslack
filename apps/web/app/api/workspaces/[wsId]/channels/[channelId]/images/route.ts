import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { canSee, errStatus } from "@/lib/chat";

export const dynamic = "force-dynamic";

const TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

type Ctx = { params: { wsId: string; channelId: string } };

/** Upload one picture (raw bytes in the body). Returns its id; a message then points at it. */
export async function POST(req: Request, ctx: Ctx) {
  const { wsId, channelId } = ctx.params;
  let userId: string;
  try {
    userId = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId: wsId } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSee(channel, userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.includes(mime)) {
    return NextResponse.json({ error: "Only PNG, JPG, GIF or WebP pictures" }, { status: 400 });
  }
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length === 0 || data.length > MAX_BYTES) {
    return NextResponse.json({ error: "Pictures can be up to 5 MB" }, { status: 400 });
  }
  const row = await prisma.upload.create({
    data: { workspaceId: wsId, channelId, userId, mime, data },
    select: { id: true },
  });
  return NextResponse.json({ id: row.id });
}
