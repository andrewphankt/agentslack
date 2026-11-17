"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GitHubIcon, MeshPage, meshFocus, meshGhost, meshInput, meshSolid } from "@/components/MeshPage";
import { useJsonHeaders } from "@/hooks/useActorUserId";

type Repo = {
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
};

export default function StartPage() {
  const router = useRouter();
  const headers = useJsonHeaders();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/github/repos?per_page=50");
        if (!res.ok) return;
        const j = (await res.json()) as { repos?: Repo[] };
        if (alive && j.repos?.length) setRepos(j.repos);
      } catch {
        /* no GitHub list; the paste box still works */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (repos ?? []).filter((r) => !q || r.full_name.toLowerCase().includes(q));
  }, [repos, filter]);

  async function create(repoUrl: string, branch?: string) {
    if (busy) return;
    setBusy(repoUrl);
    setError("");
    try {
      const res = await fetch("/api/onboarding/room", {
        method: "POST",
        headers,
        body: JSON.stringify({ repoUrl, ...(branch ? { branch } : {}) }),
      });
      const j = (await res.json().catch(() => null)) as
        | { workspaceId?: string; error?: string; existing?: boolean }
        | null;
      if (!res.ok || !j?.workspaceId) {
        setError(j?.error ?? "Could not make the room. Try again.");
        setBusy(null);
        return;
      }
      router.push(`/workspace/${j.workspaceId}/room${j.existing ? "" : "?welcome=1"}`);
    } catch {
      setError("Could not make the room. Try again.");
      setBusy(null);
    }
  }

  /** An invite is the whole link or just its code. */
  function join() {
    const t = invite.trim();
    const code = /\/join\/([A-Za-z0-9_-]+)/.exec(t)?.[1] ?? (/^[A-Za-z0-9_-]{4,}$/.test(t) ? t : "");
    if (!code) {
      setInviteError("That does not look like an invite link.");
      return;
    }
    setBusy("join");
    router.push(`/join/${code}`);
  }

  return (
    <MeshPage place="New Room" wide>
      <h1 className="text-[22px] font-bold leading-tight tracking-tight">Pick your project</h1>
      <p className="mt-1 text-sm text-zinc-600">It becomes the room. Your team and their agents build it here.</p>

      {!loaded && <p className="mt-5 text-sm text-zinc-500">Loading your projects…</p>}

      {repos && (
        <div className="mt-5">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search"
            aria-label="Search your projects"
            disabled={!!busy}
            className={meshInput}
          />
          <ul className="mt-2 max-h-72 overflow-y-auto rounded border border-zinc-200">
            {shown.map((r) => {
              const [owner, name] = r.full_name.split("/");
              return (
                <li key={r.full_name} className="border-b border-zinc-200 last:border-b-0">
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void create(r.html_url, r.default_branch)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 ${meshFocus}`}
                  >
                    <GitHubIcon className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-zinc-500">{owner} / </span>
                      <span className="font-semibold">{name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {busy === r.html_url ? "Opening…" : r.private ? "Private" : "Public"}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-zinc-500">Nothing matches.</li>}
          </ul>
        </div>
      )}

      {loaded && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) void create(link.trim());
          }}
          className="mt-5"
        >
          <label htmlFor="repo-link" className="block text-xs font-semibold text-zinc-600">
            {repos ? "Or paste its GitHub link" : "Paste its GitHub link"}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="repo-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://github.com/you/project"
              disabled={!!busy}
              className={meshInput}
            />
            <button type="submit" disabled={!!busy || !link.trim()} className={`${meshSolid} shrink-0`}>
              {busy && busy === link.trim() ? "Opening…" : "Make Room"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (invite.trim()) join();
        }}
        className="mt-5 border-t border-zinc-200 pt-5"
      >
        <label htmlFor="invite-link" className="block text-xs font-semibold text-zinc-600">
          Joining a teammate? Paste their invite link
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="invite-link"
            value={invite}
            onChange={(e) => {
              setInvite(e.target.value);
              setInviteError("");
            }}
            placeholder="Invite link"
            disabled={!!busy}
            className={meshInput}
          />
          <button type="submit" disabled={!!busy || !invite.trim()} className={`${meshGhost} shrink-0`}>
            {busy === "join" ? "Joining…" : "Join Room"}
          </button>
        </div>
        {inviteError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {inviteError}
          </p>
        )}
      </form>
    </MeshPage>
  );
}
