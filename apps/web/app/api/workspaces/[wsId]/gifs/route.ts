import { NextResponse } from "next/server";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { errStatus } from "@/lib/chat";

type Giphy = { data?: { title?: string; images?: Record<string, { url?: string } | undefined> }[] };

/** GIF search for the message bar. Off (on: false) until GIPHY_API_KEY is set. */
export async function GET(req: Request, ctx: { params: { wsId: string } }) {
  try {
    await actorUserIdFromWorkspaceAuth(ctx.params.wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) return NextResponse.json({ on: false, items: [] });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const u = new URL(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}`);
  u.searchParams.set("api_key", key);
  u.searchParams.set("limit", "18");
  u.searchParams.set("rating", "pg-13");
  if (q) u.searchParams.set("q", q);
  try {
    const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return NextResponse.json({ on: true, items: [] });
    const j = (await r.json()) as Giphy;
    const items = (j.data ?? []).flatMap((g) => {
      const thumb = g.images?.fixed_width_small?.url ?? g.images?.fixed_width?.url;
      const url = g.images?.downsized?.url ?? g.images?.original?.url;
      return thumb && url ? [{ thumb, url, title: g.title ?? "GIF" }] : [];
    });
    return NextResponse.json({ on: true, items });
  } catch {
    return NextResponse.json({ on: true, items: [] });
  }
}
