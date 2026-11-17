import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { displayNames, errStatus } from "@/lib/chat";
import { postPersonNote } from "@/lib/hooks";
import { draftStatus, githubTokenFor, goLive, repoForWorkspace } from "@/lib/github/draft";

const MESSAGES = {
  nothing: "Everything is already live.",
  conflict:
    "The live version changed in a way that clashes with the draft. Ask your agent to bring the draft up to date, then try again.",
  "no-access": "Your GitHub account cannot change this repo. Ask the room owner to add you.",
  "no-token": "Sign in with GitHub to go live.",
  "no-repo": "This room has no repo connected yet.",
  error: "GitHub did not respond. Try again in a minute.",
} as const;

const fail = (reason: keyof typeof MESSAGES, status = 200) =>
  NextResponse.json({ ok: false, reason, message: MESSAGES[reason] }, { status });

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export async function POST(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  let me: string;
  try {
    me = await actorUserIdFromWorkspaceAuth(wsId, req);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
  const [repo, token, names] = await Promise.all([
    repoForWorkspace(wsId),
    githubTokenFor(me),
    displayNames(wsId),
  ]);
  if (!repo) return fail("no-repo");
  if (!token) return fail("no-token");
  const myName = names.get(me) ?? me;

  // Who is in the draft, taken just before sending it.
  let count = 0;
  let who: string[] = [];
  try {
    const st = await draftStatus(token, repo.owner, repo.repo);
    count = st.ahead;
    who = [...new Set(st.changes.map((c) => c.who))];
  } catch {
    /* the note below falls back to a plain sentence */
  }

  const r = await goLive(token, repo.owner, repo.repo, myName);
  if (!r.ok) return fail(r.reason);

  await prisma.workspace.update({
    where: { id: wsId },
    data: { lastLiveAt: new Date(), lastLiveBy: me },
  });
  const text =
    count > 0
      ? `Sent the draft live. ${count} ${count === 1 ? "change" : "changes"}${who.length ? ` from ${list(who)}` : ""}.`
      : "Sent the draft live.";
  await postPersonNote(wsId, me, text);
  await broadcastWorkspaceEvent(wsId, { type: "draft_changed" });
  return NextResponse.json({ ok: true });
}
