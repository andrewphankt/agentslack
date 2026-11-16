import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function newAgentToken(): string {
  return "as_" + randomBytes(24).toString("base64url");
}

export function hashAgentToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Finds the agent for `Authorization: Bearer as_...` and marks it seen. */
export async function agentFromBearer(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const raw = auth.slice("Bearer ".length).trim();
  if (!raw) return null;
  const agent = await prisma.agent.findUnique({
    where: { tokenHash: hashAgentToken(raw) },
  });
  if (!agent) return null;
  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date() },
  });
  return agent;
}

export function agentLabel(
  agent: { name: string; ownerUserId: string },
  names: Map<string, string>
): string {
  return `${agent.name} (${names.get(agent.ownerUserId) ?? agent.ownerUserId}'s)`;
}
