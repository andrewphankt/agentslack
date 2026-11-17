"use client";

/**
 * TESTING ONLY. Shows who you are testing as and switches person in one click.
 * Hidden in production. Remove with /api/auth/demo before real users.
 */
const PEOPLE = ["alice", "bob"];

export function DemoSwitch({ wsId, me }: { wsId: string; me: string }) {
  if (process.env.NODE_ENV === "production" || !PEOPLE.includes(me)) return null;
  const next = encodeURIComponent(`/workspace/${wsId}/room`);
  return (
    <div className="mt-auto rounded-lg border border-dashed border-amber-500/50 p-2 text-xs text-zinc-300">
      <div className="mb-1.5 text-amber-400">Testing mode</div>
      <div className="flex gap-1">
        {PEOPLE.map((p) => (
          <a
            key={p}
            href={`/api/auth/demo?user=${p}&next=${next}`}
            aria-current={p === me ? "true" : undefined}
            className={`flex-1 rounded px-2 py-1.5 text-center capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              p === me ? "bg-zinc-100 font-semibold text-zinc-900" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {p}
          </a>
        ))}
      </div>
    </div>
  );
}
