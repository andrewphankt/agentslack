import { NextResponse } from "next/server";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { actorUserIdFromRequest } from "@/lib/auth";
import { createWorkspaceWithOwner } from "@/lib/workspaces/create";
import { createWorkspaceMemberIfNeeded } from "@/lib/workspaces/createWorkspaceMember";
import { GITHUB_API, githubTokenFor, parseRepoUrl } from "@/lib/github/draft";
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

/**
 * Looks for a room already tied to this repo.
 * "open": the person is in it, or can write to the repo on GitHub and was added.
 * "ask": a room exists but the person has no write access to the repo.
 */
async function existingRoomFor(
  repoUrl: string,
  userId: string
): Promise<{ kind: "open"; id: string } | { kind: "ask" } | { kind: "none" }> {
  const target = parseRepoUrl(repoUrl);
  if (!target) return { kind: "none" };
  const key = `${target.owner}/${target.repo}`.toLowerCase();
  const projects = await prisma.project.findMany({
    where: { sourceType: "git", sourceUrl: { contains: target.repo, mode: "insensitive" } },
    select: { workspaceId: true, sourceUrl: true },
    orderBy: { id: "asc" },
  });
  const rooms = projects
    .filter((pr) => {
      const r = pr.sourceUrl ? parseRepoUrl(pr.sourceUrl) : null;
      return r && `${r.owner}/${r.repo}`.toLowerCase() === key;
    })
    .map((pr) => pr.workspaceId);
  if (!rooms.length) return { kind: "none" };

  const mine = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId: { in: rooms } },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });
  if (mine) return { kind: "open", id: mine.workspaceId };

  // Not in the room yet: anyone who can write to the repo on GitHub belongs in it.
  const token = await githubTokenFor(userId);
  if (!token) return { kind: "ask" };
  try {
    const res = await fetch(`${GITHUB_API}/repos/${target.owner}/${target.repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const j = res.ok ? ((await res.json()) as { permissions?: { push?: boolean } }) : null;
    if (!j?.permissions?.push) return { kind: "ask" };
  } catch {
    return { kind: "ask" };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  await createWorkspaceMemberIfNeeded({
    workspaceId: rooms[0],
    userId,
    displayName: user?.displayName ?? null,
  });
  return { kind: "open", id: rooms[0] };
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

  // One room per repo: open the room this repo already has instead of making another.
  const existing = await existingRoomFor(repoUrl, userId);
  if (existing.kind === "open") return NextResponse.json({ workspaceId: existing.id, existing: true });
  if (existing.kind === "ask")
    return NextResponse.json(
      { error: "This repo already has a room. Ask a teammate for the invite link." },
      { status: 409 }
    );

  const ws = await createWorkspaceWithOwner(userId, name);

  for (const channelName of ["general", "updates", "changes"]) {
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
