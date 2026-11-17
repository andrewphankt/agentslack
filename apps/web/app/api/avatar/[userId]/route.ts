import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Someone's uploaded picture. The link carries a version, so it can be kept by the browser. */
export async function GET(_req: Request, ctx: { params: { userId: string } }) {
  const user = await prisma.user.findUnique({ where: { id: ctx.params.userId }, select: { avatarUrl: true } });
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(user?.avatarUrl ?? "");
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
