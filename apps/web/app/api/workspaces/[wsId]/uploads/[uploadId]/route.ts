import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { canSee, errStatus } from "@/lib/chat";

export const dynamic = "force-dynamic";

/** Serve one picture, only to people who can see the channel it was posted in. */
export async function GET(req: Request, ctx: { params: { wsId: string; uploadId: string } }) {
  const { wsId, uploadId } = ctx.params;
  let userId: string;
  try {
    userId = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const row = await prisma.upload.findFirst({
    where: { id: uploadId, workspaceId: wsId },
    include: { channel: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSee(row.channel, userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const bytes = new Uint8Array(row.data);
  const total = bytes.length;
  const base = {
    "Content-Type": row.mime,
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  // Range support so videos can seek and Safari will play them.
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start: number;
    let end: number;
    if (range[1] === "") {
      start = Math.max(0, total - Number(range[2]));
      end = total - 1;
    } else {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    }
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(bytes, { headers: { ...base, "Content-Length": String(total) } });
}
