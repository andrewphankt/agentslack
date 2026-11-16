import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { displayNames, errStatus } from "@/lib/chat";
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
  lastSeenAt: Date | null;
};

function view(a: Row, me: string, names: Map<string, string>) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    label: agentLabel(a, names),
    ownerUserId: a.ownerUserId,
    mine: a.ownerUserId === me,
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
  const [rows, names] = await Promise.all([
    prisma.agent.findMany({ where: { workspaceId: wsId }, orderBy: { createdAt: "asc" } }),
    displayNames(wsId),
  ]);
  return NextResponse.json({ agents: rows.map((a) => view(a, me, names)) });
}

export async function POST(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown };
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
      tokenHash: hashAgentToken(token),
    },
  });
  const names = await displayNames(wsId);
  await broadcastWorkspaceEvent(wsId, { type: "agents_changed" });
  return NextResponse.json({ agent: view(row, me, names), token });
}
