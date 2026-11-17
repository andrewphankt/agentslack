"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { GitHubIcon, MeshPage, meshFocus, meshGhost, meshInput, meshQuiet, meshSolid, meshTitle } from "@/components/MeshPage";
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
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState("");

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
        // This project already has a room: the way in is a teammate's invite link.
        if (res.status === 409) setJoining(true);
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

  if (joining)
    return (
      <MeshPage step={2} labels={["Sign in", "Room", "Agent"]} key="join">
        <h1 className={meshTitle}>Paste your invite link</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (invite.trim()) join();
          }}
          className="flex w-full flex-col items-center gap-3"
        >
          <input
            autoFocus
            value={invite}
            onChange={(e) => {
              setInvite(e.target.value);
              setInviteError("");
            }}
            placeholder="Invite link"
            aria-label="Invite link"
            disabled={!!busy}
            className={`${meshInput} h-12 text-center text-base`}
          />
          <button type="submit" disabled={!!busy || !invite.trim()} className={`${meshSolid} h-12 w-full text-base`}>
            {busy === "join" ? "Joining…" : "Join Room"}
          </button>
          {(inviteError || error) && (
            <p role="alert" className="text-center text-sm text-red-600">
              {inviteError || error}
            </p>
          )}
        </form>
        <button
          type="button"
          onClick={() => {
            setJoining(false);
            setError("");
            setInviteError("");
          }}
          className={meshQuiet}
        >
          Back
        </button>
      </MeshPage>
    );

  return (
    <MeshPage step={2} wide key="pick">
      <h1 className={meshTitle}>Pick your project</h1>

      <div className="flex w-full flex-col gap-3">
        {!loaded && <p className="text-center text-sm text-zinc-500">Loading your projects…</p>}

        {repos && (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              aria-label="Search your projects"
              disabled={!!busy}
              className={meshInput}
            />
            <ul className="max-h-[296px] overflow-y-auto rounded border border-zinc-200">
              {shown.map((r) => {
                const [owner, name] = r.full_name.split("/");
                return (
                  <li key={r.full_name} className="border-b border-zinc-200 last:border-b-0">
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void create(r.html_url, r.default_branch)}
                      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 ${meshFocus}`}
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
              {shown.length === 0 && <li className="px-3.5 py-3 text-sm text-zinc-500">Nothing matches.</li>}
            </ul>
          </>
        )}

        {loaded && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) void create(link.trim());
            }}
            className="flex gap-2"
          >
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder={repos ? "Or paste a GitHub link" : "Paste its GitHub link"}
              aria-label="GitHub link"
              disabled={!!busy}
              className={meshInput}
            />
            <button type="submit" disabled={!!busy || !link.trim()} className={`${repos ? meshGhost : meshSolid} shrink-0`}>
              {busy && busy === link.trim() ? "Opening…" : "Make Room"}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      <button type="button" onClick={() => setJoining(true)} className={meshQuiet}>
        I Have an Invite Link
      </button>
    </MeshPage>
  );
}
