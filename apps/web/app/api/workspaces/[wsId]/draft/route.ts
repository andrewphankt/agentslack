import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { displayNames, errStatus } from "@/lib/chat";
import { cleanUrl } from "@/lib/links";
import { draftStatus, githubTokenFor, repoForWorkspace, type DraftStatus } from "@/lib/github/draft";

type Ctx = { params: { wsId: string } };

async function auth(req: Request, wsId: string) {
  try {
    return { me: await actorUserIdFromWorkspaceAuth(wsId, req) };
  } catch (e) {
    return { res: NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) }) };
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const { wsId } = ctx.params;
  const a = await auth(req, wsId);
  if (!a.me) return a.res;
  const [ws, repo, token, names] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: wsId },
      select: { previewUrl: true, liveUrl: true, lastLiveAt: true, lastLiveBy: true },
    }),
    repoForWorkspace(wsId),
    githubTokenFor(a.me),
    displayNames(wsId),
  ]);
  let status: DraftStatus | null = null;
  if (repo && token) {
    try {
      status = await draftStatus(token, repo.owner, repo.repo);
    } catch {
      status = null;
    }
  }
  return NextResponse.json({
    repo: repo ? `${repo.owner}/${repo.repo}` : null,
    previewUrl: ws?.previewUrl ?? null,
    liveUrl: ws?.liveUrl ?? null,
    lastLiveAt: ws?.lastLiveAt?.toISOString() ?? null,
    lastLiveBy: ws?.lastLiveBy ? names.get(ws.lastLiveBy) ?? ws.lastLiveBy : null,
    connected: !!token,
    status,
  });
}

/** Empty clears; otherwise https, or http on localhost for testing. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { wsId } = ctx.params;
  const a = await auth(req, wsId);
  if (!a.me) return a.res;
  const body = (await req.json().catch(() => ({}))) as { previewUrl?: unknown; liveUrl?: unknown };
  let previewUrl: string | null | undefined;
  let liveUrl: string | null | undefined;
  try {
    previewUrl = cleanUrl(body.previewUrl);
    liveUrl = cleanUrl(body.liveUrl);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const ws = await prisma.workspace.update({
    where: { id: wsId },
    data: {
      ...(previewUrl !== undefined ? { previewUrl } : {}),
      ...(liveUrl !== undefined ? { liveUrl } : {}),
    },
    select: { previewUrl: true, liveUrl: true },
  });
  await broadcastWorkspaceEvent(wsId, { type: "draft_changed" });
  return NextResponse.json(ws);
}
