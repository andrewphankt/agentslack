import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { canSee, errStatus } from "@/lib/chat";

export const dynamic = "force-dynamic";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 25 * 1024 * 1024;

type Ctx = { params: { wsId: string; channelId: string } };

/** Upload one picture or short video (raw bytes in the body). Returns its id; a message then points at it. */
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
  const isVideo = VIDEO_TYPES.includes(mime);
  if (!isVideo && !IMAGE_TYPES.includes(mime)) {
    return NextResponse.json(
      { error: "Only PNG, JPG, GIF, WebP pictures or MP4, WebM, MOV videos" },
      { status: 400 }
    );
  }
  const max = isVideo ? MAX_VIDEO : MAX_IMAGE;
  const tooBig = { error: isVideo ? "Videos can be up to 25 MB" : "Pictures can be up to 5 MB" };
  if (Number(req.headers.get("content-length") ?? 0) > max) {
    return NextResponse.json(tooBig, { status: 400 });
  }
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length === 0 || data.length > max) {
    return NextResponse.json(tooBig, { status: 400 });
  }
  const row = await prisma.upload.create({
    data: { workspaceId: wsId, channelId, userId, mime, data },
    select: { id: true },
  });
  return NextResponse.json({ id: row.id });
}
