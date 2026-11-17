import { agentFromBearer } from "@/lib/agents";
import { unauthorized } from "@/lib/hooks";
import { PRD_MAX, postPrd } from "@/lib/prd";

export const dynamic = "force-dynamic";

/**
 * Lets an agent that was connected mid-session (so the room's tools are not
 * loaded yet) post the project summary with a plain request.
 */
export async function POST(req: Request) {
  const agent = await agentFromBearer(req);
  if (!agent) return unauthorized();
  const form = await req.formData().catch(() => null);
  const raw = form?.get("text");
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) return new Response("text is required\n", { status: 400 });
  if (body.length > PRD_MAX)
    return new Response(`Keep it under ${PRD_MAX} characters.\n`, { status: 400 });
  await postPrd(agent, body);
  return new Response("Posted to #updates.\n", { status: 200 });
}
