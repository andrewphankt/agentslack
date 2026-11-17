import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { displayNames, errStatus } from "@/lib/chat";
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
function cleanUrl(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error("Link must be text");
  const s = v.trim();
  if (!s) return null;
  if (s.length > 300) throw new Error("Link is too long");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error("That does not look like a link");
  }
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !local) throw new Error("The link must start with https://");
  return s;
}

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
