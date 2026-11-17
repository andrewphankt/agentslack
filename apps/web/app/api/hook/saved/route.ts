import { agentFromBearer } from "@/lib/agents";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { postChangesNote, touchFiles, unauthorized } from "@/lib/hooks";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const agent = await agentFromBearer(req);
  if (!agent) return unauthorized();
  const form = await req.formData().catch(() => null);
  const raw = typeof form?.get("files") === "string" ? (form!.get("files") as string) : "";
  const sha = typeof form?.get("sha") === "string" ? (form!.get("sha") as string).trim() : "";
  const files = raw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!files.length) return new Response("", { status: 200 });
  await touchFiles(agent, files);
  await postChangesNote(agent, files, sha);
  await broadcastWorkspaceEvent(agent.workspaceId, { type: "agents_changed" });
  return new Response("", { status: 200 });
}
