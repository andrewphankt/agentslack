import type { CSSProperties, ReactNode } from "react";

/** The same quiet grid the room's Preview sits on. */
const GRID: CSSProperties = {
  background: [
    "linear-gradient(rgba(0,0,0,0.055) 1px, transparent 1px) 0 0 / 28px 28px",
    "linear-gradient(90deg, rgba(0,0,0,0.055) 1px, transparent 1px) 0 0 / 28px 28px",
    "radial-gradient(42% 52% at 22% 28%, #d4d4d0 0, transparent 70%)",
    "radial-gradient(46% 56% at 82% 78%, #c9c9c5 0, transparent 70%)",
    "#f5f5f3",
  ].join(", "),
  colorScheme: "light",
};

/** The product's name, set the same way everywhere. */
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`font-bold uppercase tracking-[0.14em] text-zinc-900 ${className}`}>Mesh</span>;
}

/** "MESH / place": where you are, read left to right. */
export function Crumb({ place }: { place?: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm">
      <Wordmark />
      {place && (
        <>
          <span aria-hidden className="text-zinc-400">
            /
          </span>
          <span className="min-w-0 truncate font-semibold text-zinc-900">{place}</span>
        </>
      )}
    </p>
  );
}

/** GitHub's own mark (their PNG), black by default, white on a dark button. */
export function GitHubIcon({ white = false, className = "h-5 w-5" }: { white?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/github-mark.png" alt="" aria-hidden className={`${className} shrink-0 ${white ? "invert" : ""}`} />
  );
}

/** Full-page light backdrop with one centred card, for the screens before a room. */
export function MeshPage({ place, children, wide = false }: { place?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 overflow-y-auto text-zinc-900" style={GRID}>
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
        <div className={`w-full ${wide ? "max-w-[520px]" : "max-w-[400px]"} rounded-md border border-zinc-200 bg-white`}>
          <div className="border-b border-zinc-200 px-5 py-3.5">
            <Crumb place={place} />
          </div>
          <div className="px-5 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export const meshFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1";
export const meshSolid = `inline-flex h-10 items-center justify-center gap-2.5 rounded bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 ${meshFocus}`;
export const meshGhost = `inline-flex h-10 items-center justify-center gap-2.5 rounded border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 ${meshFocus}`;
export const meshInput =
  "w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-zinc-900 focus-visible:ring-1 focus-visible:ring-zinc-900";
