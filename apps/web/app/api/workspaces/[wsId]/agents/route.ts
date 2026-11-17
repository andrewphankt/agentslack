import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { avatarUrls, displayNames, errStatus } from "@/lib/chat";
import { agentLabel, hashAgentToken, newAgentToken } from "@/lib/agents";

const NAMES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  other: "Agent",
};

type Row = {
  id: string;
  kind: string;
  name: string;
  ownerUserId: string;
  purpose: string | null;
  lastSeenAt: Date | null;
};

function view(
  a: Row,
  me: string,
  names: Map<string, string>,
  file: string | null = null,
  avatars: Map<string, string | null> = new Map(),
  slot = 0
) {
  const ownerName = names.get(a.ownerUserId) ?? a.ownerUserId;
  return {
    purpose: a.purpose,
    ownerName,
    ownerAvatarUrl: avatars.get(a.ownerUserId) ?? null,
    /** Short sidebar text: the owner, plus what this agent is for when they have several. */
    short: a.purpose ? `${ownerName} · ${a.purpose}` : ownerName,
    /** 0 for the owner's first agent, 1 for the second... picks the badge colour. */
    slot,
    id: a.id,
    kind: a.kind,
    name: a.name,
    label: agentLabel(a, names),
    ownerUserId: a.ownerUserId,
    mine: a.ownerUserId === me,
    activeFile: file,
    online: !!a.lastSeenAt && Date.now() - a.lastSeenAt.getTime() < 2 * 60_000,
  };
}

export async function GET(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  // A connect command nobody ran within a day is clutter: drop it.
  await prisma.agent.deleteMany({
    where: {
      workspaceId: wsId,
      lastSeenAt: null,
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) },
    },
  });
  const [rows, names, recent] = await Promise.all([
    prisma.agent.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    displayNames(wsId),
    prisma.fileActivity.findMany({
      where: { workspaceId: wsId, updatedAt: { gt: new Date(Date.now() - 10 * 60_000) } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const latest = new Map<string, string>();
  for (const f of recent) if (!latest.has(f.agentId)) latest.set(f.agentId, f.path);
  const avatars = await avatarUrls(rows.map((a) => a.ownerUserId));
  const seen = new Map<string, number>();
  return NextResponse.json({
    agents: rows.map((a) => {
      const p = latest.get(a.id);
      const slot = seen.get(a.ownerUserId) ?? 0;
      seen.set(a.ownerUserId, slot + 1);
      return view(a, me, names, p ? p.split("/").pop() || p : null, avatars, slot);
    }),
  });
}

export async function POST(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; purpose?: unknown };
  const purpose =
    typeof body.purpose === "string"
      ? body.purpose.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 24) || null
      : null;
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!NAMES[kind]) {
    return NextResponse.json({ error: "Bad kind" }, { status: 400 });
  }
  const token = newAgentToken();
  const row = await prisma.agent.create({
    data: {
      workspaceId: wsId,
      ownerUserId: me,
      kind,
      name: NAMES[kind],
      purpose,
      tokenHash: hashAgentToken(token),
    },
  });
  const names = await displayNames(wsId);
  await broadcastWorkspaceEvent(wsId, { type: "agents_changed" });
  return NextResponse.json({ agent: view(row, me, names), token });
}
