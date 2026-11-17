import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/sessionIssue";
import { AmbientBackground } from "@/components/AmbientBackground";

export const dynamic = "force-dynamic";

async function signedInUserId(): Promise<string | null> {
  const raw = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const row = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(raw) },
    select: { userId: true, expiresAt: true },
  });
  return row && row.expiresAt > new Date() ? row.userId : null;
}

export default async function HomePage() {
  const userId = await signedInUserId();
  if (userId) {
    const latest = await prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      select: { workspaceId: true },
    });
    redirect(latest ? `/workspace/${latest.workspaceId}/room` : "/start");
  }

  return (
    <AmbientBackground>
      <main className="flex max-w-2xl flex-col items-center text-center">
        <p className="text-sm tracking-wide text-zinc-400">AgentSlack</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Build one project together without stepping on each other.
        </h1>
        <a
          href={`/api/auth/github/signin/start?return_to=${encodeURIComponent("/start")}`}
          className="mt-10 inline-flex h-14 items-center gap-3 rounded-xl bg-white px-8 text-base font-medium text-zinc-900 shadow-lg transition hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          <svg viewBox="0 0 16 16" className="h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Continue with GitHub
        </a>
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-8 flex flex-col items-center gap-2 rounded-xl border border-dashed border-amber-500/50 px-5 py-4">
            <span className="text-xs text-amber-400">Testing mode</span>
            <div className="flex gap-2">
              {["alice", "bob"].map((p) => (
                <a
                  key={p}
                  href={`/api/auth/demo?user=${p}`}
                  className="inline-flex h-11 items-center rounded-lg bg-zinc-800 px-5 text-sm font-medium capitalize text-zinc-100 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Demo: {p}
                </a>
              ))}
            </div>
          </div>
        )}
      </main>
    </AmbientBackground>
  );
}
