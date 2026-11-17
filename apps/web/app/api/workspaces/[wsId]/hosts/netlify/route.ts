import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { errStatus } from "@/lib/chat";
import { repoForWorkspace } from "@/lib/github/draft";
import { postPersonNote } from "@/lib/hooks";

export const dynamic = "force-dynamic";

type Ctx = { params: { wsId: string } };
type Site = {
  id: string;
  name: string;
  ssl_url?: string | null;
  url?: string | null;
  build_settings?: {
    repo_url?: string | null;
    repo_path?: string | null;
    repo_branch?: string | null;
    allowed_branches?: string[] | null;
  } | null;
};

const api = () => (process.env.NETLIFY_API_BASE || "https://api.netlify.com/api/v1").replace(/\/$/, "");
const DRAFT = "draft";

async function who(req: Request, wsId: string) {
  try {
    return { me: await actorUserIdFromWorkspaceAuth(wsId, req) };
  } catch (e) {
    return { res: NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) }) };
  }
}

/** Whether one-click Netlify is switched on for this copy of the app. */
export async function GET(req: Request, ctx: Ctx) {
  const a = await who(req, ctx.params.wsId);
  if (!a.me) return a.res;
  const clientId = process.env.NETLIFY_CLIENT_ID || "";
  return NextResponse.json({ on: !!clientId, clientId: clientId || null });
}

function matches(s: Site, full: string) {
  const b = s.build_settings;
  const path = (b?.repo_path || "").toLowerCase();
  const url = (b?.repo_url || "").toLowerCase().replace(/\.git$/, "");
  return path === full || url.endsWith(`/${full}`);
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * The person just signed in to Netlify in a pop-up. Their Netlify key is used for this one
 * request and never stored. Without `siteId` this lists their projects (or connects straight
 * away when exactly one is built from the room's repo); with it, that project is connected.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { wsId } = ctx.params;
  const a = await who(req, wsId);
  if (!a.me) return a.res;
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; siteId?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 400) return bad("Sign in to Netlify first");
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  let sites: Site[];
  try {
    const r = await fetch(`${api()}/sites?filter=all&per_page=100`, { headers: H, cache: "no-store" });
    if (r.status === 401) return bad("The Netlify sign-in ran out. Connect again.", 401);
    if (!r.ok) return bad("Netlify did not answer. Try again.", 502);
    sites = (await r.json()) as Site[];
  } catch {
    return bad("Netlify did not answer. Try again.", 502);
  }

  const repo = await repoForWorkspace(wsId);
  const full = repo ? `${repo.owner}/${repo.repo}`.toLowerCase() : "";
  const mine = full ? sites.filter((s) => matches(s, full)) : [];
  const wanted = typeof body.siteId === "string" ? body.siteId : mine.length === 1 ? mine[0].id : "";

  if (!wanted) {
    return NextResponse.json({
      sites: [...mine, ...sites.filter((s) => !mine.includes(s))].slice(0, 50).map((s) => ({
        id: s.id,
        name: s.name,
        url: s.ssl_url || s.url || null,
        match: mine.includes(s),
      })),
    });
  }

  const site = sites.find((s) => s.id === wanted);
  if (!site) return bad("That project is not in your Netlify account");

  // Ask Netlify to also build the shared draft, on its own link. The public site keeps
  // building from the same place as before.
  const b = site.build_settings;
  const have = b?.allowed_branches ?? [];
  let building = have.includes(DRAFT);
  if (!building && b?.repo_branch) {
    try {
      const next = Array.from(new Set([b.repo_branch, ...have, DRAFT]));
      const r = await fetch(`${api()}/sites/${site.id}`, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ repo: { allowed_branches: next } }),
      });
      if (r.ok) {
        const after = (await r.json()) as Site;
        building = !!after.build_settings?.allowed_branches?.includes(DRAFT);
      }
    } catch {
      building = false;
    }
  }

  const previewUrl = `https://${DRAFT}--${site.name}.netlify.app`;
  const liveUrl = site.ssl_url || site.url || null;
  await prisma.workspace.update({
    where: { id: wsId },
    data: { previewUrl, ...(liveUrl ? { liveUrl } : {}) },
  });
  await postPersonNote(wsId, a.me, `Connected the preview to ${site.name} on Netlify.`);
  await broadcastWorkspaceEvent(wsId, { type: "draft_changed" });
  return NextResponse.json({
    ok: true,
    previewUrl,
    liveUrl,
    /** False when Netlify did not confirm it will build the draft; the person may need to switch it on there. */
    building,
    linked: !!b?.repo_branch,
  });
}
