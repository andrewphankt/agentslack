import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromRequest } from "@/lib/auth";
import { createWorkspaceWithOwner } from "@/lib/workspaces/create";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId =
    searchParams.get("userId") ?? (await actorUserIdFromRequest(req));
  const rows = await prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { joinedAt: "desc" },
  });
  return NextResponse.json(
    rows.map((r) => ({
      workspaceId: r.workspace.id,
      name: r.workspace.name,
      inviteCode: r.workspace.inviteCode,
      role: r.role,
    }))
  );
}

export async function POST(req: Request) {
  const creatorUserId = await actorUserIdFromRequest(req);
  const body = (await req.json()) as { name?: string };
  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : "Untitled Workspace";

  const ws = await createWorkspaceWithOwner(creatorUserId, name);

  return NextResponse.json({
    workspaceId: ws.id,
    inviteCode: ws.inviteCode,
    onboardingRequired: true,
  });
}
