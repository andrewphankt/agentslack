import { prisma } from "@/lib/prisma";
import { openOAuthToken } from "@/lib/crypto/oauthToken";
import { GITHUB_API, repoForWorkspace } from "@/lib/github/draft";

/**
 * "added": can edit the repo now. "invited": GitHub sent them an invitation to accept.
 * "already": had access. "skipped": nothing to do or not possible here. "failed": GitHub refused.
 */
export type RepoAccess = "added" | "invited" | "already" | "skipped" | "failed";

async function githubAccount(userId: string): Promise<{ token: string; login: string } | null> {
  const conn = await prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId, provider: "github" } },
    select: { accessToken: true, metadata: true },
  });
  const login = (conn?.metadata as { github_login?: unknown } | null)?.github_login;
  if (!conn || typeof login !== "string" || !login) return null;
  try {
    return { token: openOAuthToken(conn.accessToken), login };
  } catch {
    return null;
  }
}

function gh(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AgentSlack",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

/**
 * Someone joined the room: give them edit access to the room's repo, using the
 * room creator's GitHub account to invite and the joiner's own to accept.
 */
export async function giveRepoAccess(wsId: string, joinerUserId: string): Promise<RepoAccess> {
  try {
    const repo = await repoForWorkspace(wsId);
    const project = await prisma.project.findFirst({
      where: { workspaceId: wsId, sourceType: "git" },
      orderBy: { id: "asc" },
      select: { ownerUserId: true },
    });
    if (!repo || !project || project.ownerUserId === joinerUserId) return "skipped";
    const [owner, joiner] = await Promise.all([
      githubAccount(project.ownerUserId),
      githubAccount(joinerUserId),
    ]);
    if (!owner || !joiner) return "skipped";
    if (joiner.login.toLowerCase() === repo.owner.toLowerCase()) return "already";

    const base = `/repos/${repo.owner}/${repo.repo}`;
    const login = encodeURIComponent(joiner.login);
    const has = await gh(owner.token, `${base}/collaborators/${login}`);
    if (has.status === 204) return "already";

    const put = await gh(owner.token, `${base}/collaborators/${login}`, {
      method: "PUT",
      body: JSON.stringify({ permission: "push" }),
    });
    if (put.status === 204) return "added";
    if (put.status !== 201) return "failed";

    const invitation = (await put.json().catch(() => null)) as { id?: number } | null;
    if (!invitation?.id) return "invited";
    const accept = await gh(joiner.token, `/user/repository_invitations/${invitation.id}`, {
      method: "PATCH",
    });
    return accept.status === 204 ? "added" : "invited";
  } catch {
    return "failed";
  }
}
