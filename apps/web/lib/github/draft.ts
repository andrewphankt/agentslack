import { prisma } from "@/lib/prisma";
import { openOAuthToken } from "@/lib/crypto/oauthToken";

export const GITHUB_API = process.env.GITHUB_API_URL ?? "https://api.github.com";

const DRAFT = "draft";

export type DraftChange = { who: string; message: string; at: string };
export type DraftStatus = {
  state: "ready" | "nothing" | "no-draft" | "no-access";
  ahead: number;
  behind: number;
  changes: DraftChange[];
  files: string[];
};
export type GoLiveResult =
  | { ok: true; sha: string }
  | { ok: false; reason: "nothing" | "conflict" | "no-access" | "error" };

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const u = url.trim();
  const m =
    /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(u) ??
    /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com[/:]([^/\s]+)\/([^/\s?#]+?)(?:\.git)?\/?(?:[?#].*)?$/.exec(u);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export async function repoForWorkspace(
  wsId: string
): Promise<{ owner: string; repo: string } | null> {
  const projects = await prisma.project.findMany({
    where: { workspaceId: wsId, sourceType: "git", sourceUrl: { not: null } },
    orderBy: { id: "asc" },
    select: { sourceUrl: true },
  });
  for (const p of projects) {
    const r = p.sourceUrl ? parseRepoUrl(p.sourceUrl) : null;
    if (r) return r;
  }
  return null;
}

export async function githubTokenFor(userId: string): Promise<string | null> {
  const conn = await prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId, provider: "github" } },
    select: { accessToken: true },
  });
  if (conn) {
    try {
      return openOAuthToken(conn.accessToken);
    } catch {
      /* fall through to the shared token */
    }
  }
  return process.env.GITHUB_TOKEN?.trim() || null;
}

async function gh(token: string, path: string, init?: RequestInit): Promise<Response> {
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

const empty = (state: DraftStatus["state"]): DraftStatus => ({
  state,
  ahead: 0,
  behind: 0,
  changes: [],
  files: [],
});

type Compare = {
  ahead_by?: number;
  behind_by?: number;
  commits?: {
    commit?: { message?: string; author?: { name?: string; date?: string } };
    author?: { login?: string } | null;
  }[];
  files?: { filename?: string }[];
};

const repoPath = (owner: string, repo: string) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

export async function draftStatus(
  token: string,
  owner: string,
  repo: string
): Promise<DraftStatus> {
  const base = repoPath(owner, repo);
  const r = await gh(token, base);
  if (r.status === 401 || r.status === 403 || r.status === 404) return empty("no-access");
  if (!r.ok) throw new Error(`repo ${r.status}`);
  const def = ((await r.json()) as { default_branch?: string }).default_branch ?? "main";
  const c = await gh(token, `${base}/compare/${encodeURIComponent(def)}...${DRAFT}`);
  if (c.status === 404) return empty("no-draft");
  if (c.status === 401 || c.status === 403) return empty("no-access");
  if (!c.ok) throw new Error(`compare ${c.status}`);
  const j = (await c.json()) as Compare;
  const commits = j.commits ?? [];
  // GitHub lists oldest first; show newest first.
  const changes: DraftChange[] = commits
    .map((x) => ({
      who: x.commit?.author?.name ?? x.author?.login ?? "Someone",
      message: (x.commit?.message ?? "").split("\n")[0].slice(0, 200),
      at: x.commit?.author?.date ?? "",
    }))
    .reverse()
    .slice(0, 20);
  const ahead = j.ahead_by ?? commits.length;
  return {
    state: ahead > 0 ? "ready" : "nothing",
    ahead,
    behind: j.behind_by ?? 0,
    changes,
    files: (j.files ?? []).flatMap((f) => (f.filename ? [f.filename] : [])).slice(0, 50),
  };
}

export async function goLive(
  token: string,
  owner: string,
  repo: string,
  by: string
): Promise<GoLiveResult> {
  const base = repoPath(owner, repo);
  try {
    const r = await gh(token, base);
    if (r.status === 401 || r.status === 403 || r.status === 404) {
      return { ok: false, reason: "no-access" };
    }
    if (!r.ok) return { ok: false, reason: "error" };
    const def = ((await r.json()) as { default_branch?: string }).default_branch ?? "main";
    const m = await gh(token, `${base}/merges`, {
      method: "POST",
      body: JSON.stringify({ base: def, head: DRAFT, commit_message: `Go live (${by})` }),
    });
    if (m.status === 201) {
      const sha = ((await m.json().catch(() => ({}))) as { sha?: string }).sha ?? "";
      return { ok: true, sha };
    }
    if (m.status === 204) return { ok: false, reason: "nothing" };
    if (m.status === 409) return { ok: false, reason: "conflict" };
    if (m.status === 403 || m.status === 404) return { ok: false, reason: "no-access" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}
