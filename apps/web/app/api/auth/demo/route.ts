import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendSessionCookie, createBrowserSession } from "@/lib/sessionIssue";
import { createWorkspaceMemberIfNeeded } from "@/lib/workspaces/createWorkspaceMember";

export const dynamic = "force-dynamic";

/**
 * TESTING ONLY. One click signs you in as a demo person, no password.
 * Off in production. Remove this route (and DemoSwitch) before real users.
 *   /api/auth/demo?user=alice
 *   /api/auth/demo?user=bob&next=/workspace/ID/room   (also joins that room)
 */
const DEMO_USERS = ["alice", "bob"];

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const user = url.searchParams.get("user") ?? "alice";
  if (!DEMO_USERS.includes(user)) {
    return NextResponse.json({ error: "Unknown demo user" }, { status: 400 });
  }
  const row = await prisma.user.findUnique({ where: { id: user } });
  if (!row) {
    return NextResponse.json(
      { error: "Demo users are missing. Run: npm run db:seed" },
      { status: 500 }
    );
  }

  // Only same-site paths, so this can never bounce someone to another site.
  const nextRaw = url.searchParams.get("next") ?? "/";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";

  // Switching person inside a room: make sure they are in it, so both can test together.
  const wsId = next.match(/^\/workspace\/([^/?]+)/)?.[1];
  if (wsId && (await prisma.workspace.findUnique({ where: { id: wsId }, select: { id: true } }))) {
    await createWorkspaceMemberIfNeeded({ workspaceId: wsId, userId: user });
  }

  const { rawToken } = await createBrowserSession(user);
  const res = NextResponse.redirect(new URL(next, url.origin));
  appendSessionCookie(res, rawToken);
  return res;
}
