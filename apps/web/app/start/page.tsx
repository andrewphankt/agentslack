"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
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
  const [filter, setFilter] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/room", {
        method: "POST",
        headers,
        body: JSON.stringify({ repoUrl, ...(branch ? { branch } : {}) }),
      });
      const j = (await res.json().catch(() => null)) as
        | { workspaceId?: string; error?: string }
        | null;
      if (!res.ok || !j?.workspaceId) {
        setError(j?.error ?? "Could not create the room. Try again.");
        setBusy(false);
        return;
      }
      router.push(`/workspace/${j.workspaceId}/room?welcome=1`);
    } catch {
      setError("Could not create the room. Try again.");
      setBusy(false);
    }
  }

  return (
    <AmbientBackground>
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur">
        <h1 className="text-xl font-semibold text-zinc-50">Pick a repo</h1>
        <p className="mt-1 text-sm text-zinc-400">This becomes your room.</p>

        {repos && (
          <div className="mt-5">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search your repos"
              aria-label="Search your repos"
              disabled={busy}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            />
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-800">
              {shown.map((r) => (
                <li key={r.full_name}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void create(r.html_url, r.default_branch)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 focus-visible:bg-zinc-800 focus-visible:outline-none disabled:opacity-60"
                  >
                    <span className="min-w-0 truncate">{r.full_name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {r.private ? "private" : "public"}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="px-3 py-3 text-sm text-zinc-500">No repos match.</li>
              )}
            </ul>
          </div>
        )}

        <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
          <span className="h-px flex-1 bg-zinc-800" />
          {repos ? "or paste a link" : "Paste a link"}
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (link.trim()) void create(link.trim());
          }}
          className="flex flex-col gap-3"
        >
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://github.com/you/project"
            aria-label="Repo link"
            disabled={busy}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={busy || !link.trim()}
            className="h-11 rounded-lg bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
          >
            {busy ? "Creating your room…" : "Create room"}
          </button>
        </form>

        {busy && repos && <p className="mt-3 text-sm text-zinc-400">Creating your room…</p>}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    </AmbientBackground>
  );
}
