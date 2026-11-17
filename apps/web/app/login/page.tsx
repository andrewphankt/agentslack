"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { GitHubIcon, MeshPage, meshGhost, meshInput, meshSolid } from "@/components/MeshPage";
import { safeNextPath } from "@/lib/http/safeNextPath";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withPassword, setWithPassword] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim().toLowerCase(), password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "That name and password did not work.");
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const ghErr = searchParams.get("github_error");

  return (
    <MeshPage>
      <h1 className="text-[22px] font-bold leading-tight tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-600">Use the GitHub account your project is on.</p>

      {ghErr && (
        <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          GitHub sign-in did not finish. Try again.
        </p>
      )}

      <a
        href={`/api/auth/github/signin/start?return_to=${encodeURIComponent(next)}`}
        className={`${meshSolid} mt-6 h-11 w-full`}
      >
        <GitHubIcon white />
        Continue with GitHub
      </a>

      {withPassword ? (
        <form
          className="mt-5 flex flex-col gap-2 border-t border-zinc-200 pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            className={meshInput}
            placeholder="Name"
            aria-label="Name"
            autoComplete="username"
            autoFocus
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
          <input
            type="password"
            className={meshInput}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !handle.trim() || !password} className={`${meshGhost} w-full`}>
            {busy ? "Signing In…" : "Sign In"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setWithPassword(true)}
          className="mt-4 text-xs font-semibold text-zinc-500 hover:text-zinc-900"
        >
          Use a Password Instead
        </button>
      )}
    </MeshPage>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
