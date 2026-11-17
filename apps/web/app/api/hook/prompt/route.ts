import { prisma } from "@/lib/prisma";
import { agentFromBearer } from "@/lib/agents";
import { displayNames } from "@/lib/chat";
import { readJson, unauthorized } from "@/lib/hooks";

export const dynamic = "force-dynamic";

const FIXED =
  "Your work is saved to the team's shared draft automatically when you finish a turn. Do not run git commands and do not mention commits.";

export async function POST(req: Request) {
  const agent = await agentFromBearer(req);
  if (!agent) return unauthorized();
  const body = await readJson(req);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const since = agent.lastPromptAt ?? agent.createdAt;

  const lines = [FIXED];
  const dms = await prisma.channel.findMany({
    where: { workspaceId: agent.workspaceId, kind: "dm", memberIds: { has: agent.ownerUserId } },
    select: { id: true },
  });
  if (dms.length) {
    const names = await displayNames(agent.workspaceId);
    const rows = await prisma.collaborationMessage.findMany({
      where: {
        workspaceId: agent.workspaceId,
        type: "chat",
        channelId: { in: dms.map((d) => d.id) },
        createdAt: { gt: since },
        authorUserId: { not: agent.ownerUserId },
      },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    for (const m of rows) {
      const t = (m.content as { text?: unknown } | null)?.text;
      if (typeof t !== "string") continue;
      const who = (m.authorUserId && names.get(m.authorUserId)) || m.authorUserId || m.fromAgent;
      lines.push(`Message from ${who}: ${t.slice(0, 500)}`);
    }
  }

  // A request the owner left from the room (for example "set up the preview") is handed over once.
  const asks = await prisma.collaborationMessage.findMany({
    where: {
      workspaceId: agent.workspaceId,
      type: "chat",
      authorUserId: agent.ownerUserId,
      createdAt: { gt: new Date(Date.now() - 24 * 3600_000) },
      content: { path: ["forOwner"], equals: agent.ownerUserId },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  let handed = false;
  for (const m of asks) {
    const c = m.content as { request?: unknown; deliveredAt?: unknown } | null;
    if (!c || typeof c.request !== "string" || c.deliveredAt) continue;
    // Only the newest waiting request is handed over; older ones are closed with it.
    if (!handed) lines.push(
      `REQUEST FROM THE ROOM: your owner pressed a button in the team room asking for the following. Do it now, in this turn, before anything else.\n${c.request}`
    );
    await prisma.collaborationMessage.update({
      where: { id: m.id },
      data: { content: { ...(m.content as object), deliveredAt: new Date().toISOString() } },
    });
    handed = true;
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastPromptAt: new Date(), ...(prompt ? { intent: prompt.slice(0, 140) } : {}) },
  });
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
