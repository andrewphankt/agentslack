import type { ReactNode } from "react";

/** Points spread evenly over a sphere, tilted a little, seen from the front. */
function spherePoints(n: number): { x: number; y: number; z: number }[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const tilt = 0.45;
  return Array.from({ length: n }, (_, i) => {
    const y0 = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y0 * y0);
    const a = i * golden;
    const x = Math.cos(a) * r;
    const z0 = Math.sin(a) * r;
    return { x, y: y0 * Math.cos(tilt) - z0 * Math.sin(tilt), z: y0 * Math.sin(tilt) + z0 * Math.cos(tilt) };
  }).sort((p, q) => p.z - q.z);
}
const round = (v: number) => Math.round(v * 100) / 100;

/** The Mesh mark: many dots, one sphere. Near dots are larger and darker. */
export function MeshMark({ size = 18, dots = 34, className = "" }: { size?: number; dots?: number; className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} className={`shrink-0 ${className}`} fill="currentColor" aria-hidden>
      {spherePoints(dots).map((p, i) => {
        const near = (p.z + 1) / 2;
        return <circle key={i} cx={round(p.x * 9.6)} cy={round(p.y * 9.6)} r={round((0.55 + near * 1.05) * Math.min(1, Math.sqrt(34 / dots)))} opacity={round(0.22 + near * 0.78)} />;
      })}
    </svg>
  );
}

/** The product's name, set the same way everywhere. */
export function Wordmark({ className = "", mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={`inline-flex items-center text-zinc-900 ${className}`}>
      {mark && <MeshMark size={22} />}
      <span className={mark ? "sr-only" : "font-bold uppercase tracking-[0.14em]"}>Mesh</span>
    </span>
  );
}

/** GitHub's own mark (their PNG), black by default, white on a dark button. */
export function GitHubIcon({ white = false, className = "h-5 w-5" }: { white?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/github-mark.png" alt="" aria-hidden className={`${className} shrink-0 ${white ? "mix-blend-screen invert" : "mix-blend-multiply"}`} />
  );
}

function Tick({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export const STEPS_NEW = ["Sign in", "Project", "Agent"];
export const STEPS_JOIN = ["Sign in", "Room", "Agent"];

/** The circles across the top of setting up. The step you just reached fills in as the page opens. */
export function Steps({ at, labels = STEPS_NEW }: { at: number; labels?: string[] }) {
  return (
    <ol className="flex items-center gap-3.5 text-sm font-semibold">
      {labels.map((label, i) => {
        const n = i + 1;
        const now = n === at;
        return (
          <li key={label} className="flex items-center gap-3.5" aria-current={now ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={`h-px w-8 ${n < at ? "bg-zinc-900" : now ? "step-line" : "bg-zinc-200"}`} />}
            <span className={`flex items-center gap-2 ${n < at ? "text-zinc-900" : now ? "step-label" : "text-zinc-500"}`}>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                  n < at ? "bg-zinc-900 text-white" : now ? "step-dot" : "border border-zinc-200"
                }`}
              >
                {n < at ? <Tick size={14} /> : n}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** One white screen for everything before the room: steps on top, one thing to do in the middle. */
export function MeshPage({
  step,
  labels,
  children,
  wide = false,
  backdrop,
}: {
  /** Which circle is filling in. Leave out for a page that is not a step. */
  step?: number;
  labels?: string[];
  children: ReactNode;
  wide?: boolean;
  /** Drawn behind everything, e.g. the sign-in orbits. */
  backdrop?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 flex flex-col items-center overflow-y-auto bg-white px-6 py-7 text-zinc-900" style={{ colorScheme: "light" }}>
      {backdrop}
      <div className="relative flex min-h-6 w-full shrink-0 items-center justify-center">
        {step ? <Steps at={step} labels={labels} /> : <Wordmark className="text-sm" />}
      </div>
      <div className={`soft-in relative flex w-full ${wide ? "max-w-[480px]" : "max-w-[400px]"} flex-1 flex-col items-center justify-center gap-7 py-10`}>
        {children}
      </div>
    </div>
  );
}

export const meshTitle = "text-center text-[28px] font-bold leading-tight tracking-tight";
export const meshFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2";
export const meshBig = `inline-flex h-[52px] items-center justify-center gap-3 rounded-md bg-zinc-900 px-8 text-base font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 ${meshFocus}`;
export const meshSolid = `inline-flex h-10 items-center justify-center gap-2.5 rounded bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 ${meshFocus}`;
export const meshGhost = `inline-flex h-10 items-center justify-center gap-2.5 rounded border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 ${meshFocus}`;
export const meshInput =
  "h-10 w-full rounded border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:border-zinc-900 focus-visible:ring-1 focus-visible:ring-zinc-900";
export const meshQuiet = `rounded text-[13px] text-zinc-500 hover:text-zinc-900 ${meshFocus}`;
