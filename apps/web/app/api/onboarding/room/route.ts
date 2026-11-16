import { NextResponse } from "next/server";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromRequest } from "@/lib/auth";
import { createWorkspaceWithOwner } from "@/lib/workspaces/create";
import { cloneHostedGitRepo, sanitizeHostedGitHttps } from "@/lib/git/clone";
import { resolveGithubAccessToken } from "@/lib/oauth/resolveGithubToken";
import { runFullProjectIndex } from "@/lib/context/indexProject";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";
import { recordProjectIndexError } from "@/lib/workspace/activity";

async function importAndIndex(params: {
  wsId: string;
  userId: string;
  projectId: string;
  projectName: string;
  repoUrl: string;
  branch?: string;
}) {
  const { wsId, userId, projectId } = params;
  const fail = async (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.project.update({
      where: { id: projectId },
      data: { indexingStatus: "error", indexError: msg.slice(0, 2000) },
    });
    await recordProjectIndexError(projectId, msg.slice(0, 2000));
  };
  const dest = path.join(process.cwd(), "storage", "repos", projectId);
  try {
    const token = await resolveGithubAccessToken({ userId });
    await cloneHostedGitRepo({
      repoUrl: params.repoUrl,
      destDir: dest,
      branch: params.branch,
      token,
    });
  } catch (e) {
    return fail(e);
  }
  await broadcastWorkspaceEvent(wsId, {
    type: "project_connected",
    payload: { project_id: projectId, name: params.projectName, owner_user_id: userId },
  });
  try {
    await runFullProjectIndex(projectId);
  } catch (e) {
    await fail(e);
  }
}

export async function POST(req: Request) {
  const userId = await actorUserIdFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as {
    repoUrl?: unknown;
    name?: unknown;
    branch?: unknown;
  };

  const rawUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
  let repoUrl: string;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") throw new Error("not https");
    repoUrl = sanitizeHostedGitHttps(`${u.origin}${u.pathname.replace(/\/+$/, "")}`);
  } catch {
    return NextResponse.json(
      { error: "Use a link like https://github.com/you/project" },
      { status: 400 }
    );
  }

  const repoName =
    new URL(repoUrl).pathname.split("/").filter(Boolean).pop()?.replace(/\.git$/i, "") ||
    "project";
  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : repoName;
  const branch =
    typeof body.branch === "string" && body.branch.trim() ? body.branch.trim() : undefined;

  const ws = await createWorkspaceWithOwner(userId, name);

  for (const channelName of ["general", "prd"]) {
    await prisma.channel.upsert({
      where: {
        workspaceId_kind_name: { workspaceId: ws.id, kind: "channel", name: channelName },
      },
      update: {},
      create: { workspaceId: ws.id, kind: "channel", name: channelName },
    });
  }

  const project = await prisma.project.create({
    data: {
      workspaceId: ws.id,
      ownerUserId: userId,
      name: repoName,
      sourceType: "git",
      sourceUrl: repoUrl,
      indexingStatus: "pending",
    },
  });

  void importAndIndex({
    wsId: ws.id,
    userId,
    projectId: project.id,
    projectName: project.name,
    repoUrl,
    branch,
  }).catch((e) => console.error("[onboarding] import failed", e));

  return NextResponse.json({ workspaceId: ws.id });
}
