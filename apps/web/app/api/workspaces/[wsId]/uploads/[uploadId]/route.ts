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
  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
