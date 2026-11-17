import { randomUUID } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { agentFromBearer } from "@/lib/agents";
import { agentLabel } from "@/lib/agents";
import { displayNames } from "@/lib/chat";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";

export type HookAgent = NonNullable<Awaited<ReturnType<typeof agentFromBearer>>>;

export const TOUCH_WINDOW_MS = 10 * 60_000;
export const WARN_WINDOW_MS = 30 * 60_000;

export const unauthorized = () =>
  new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Path of `file` relative to `cwd`; null if it is outside it or empty. */
export function relPath(file: unknown, cwd: unknown): string | null {
  if (typeof file !== "string" || !file) return null;
  const base = typeof cwd === "string" && cwd ? cwd : "/";
  const rel = path.relative(base, path.resolve(base, file));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel;
}

export async function ensureChannel(wsId: string, name: string) {
  return prisma.channel.upsert({
    where: { workspaceId_kind_name: { workspaceId: wsId, kind: "channel", name } },
    update: {},
    create: { workspaceId: wsId, kind: "channel", name },
  });
}

export async function postChangesNote(agent: HookAgent, files: string[], sha: string) {
  const names = await displayNames(agent.workspaceId);
  const channel = await ensureChannel(agent.workspaceId, "changes");
  const list = files.join(", ");
  const intent = agent.intent?.trim() ?? "";
  const row = await prisma.collaborationMessage.create({
    data: {
      workspaceId: agent.workspaceId,
      channelId: channel.id,
      authorAgentId: agent.id,
      authorUserId: null,
      type: "note",
      fromAgent: agentLabel(agent, names),
      toTarget: "#changes",
      content: {
        changed: `Changed ${list}`,
        decided: "",
        files,
        sha,
        text: `Changed: ${list}${intent ? `\n${intent}` : ""}`,
      },
      messageId: randomUUID(),
    },
  });
  await broadcastWorkspaceEvent(agent.workspaceId, {
    type: "chat_message",
    channelId: channel.id,
    messageId: row.id,
  });
}

export async function touchFiles(agent: HookAgent, files: string[]) {
  const now = new Date();
  for (const p of files) {
    await prisma.fileActivity.upsert({
      where: { agentId_path: { agentId: agent.id, path: p } },
      update: { updatedAt: now },
      create: { workspaceId: agent.workspaceId, agentId: agent.id, path: p, updatedAt: now },
    });
  }
}
