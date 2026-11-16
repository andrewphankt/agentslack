const COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

const AGENT_CODES: Record<string, string> = { claude: "CL", codex: "CX", gemini: "GM" };
export const agentCode = (kind?: string) => (kind && AGENT_CODES[kind]) || "AG";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const SIZES = {
  20: { box: "h-5 w-5", text: "text-[10px]" },
  24: { box: "h-6 w-6", text: "text-[11px]" },
  32: { box: "h-8 w-8", text: "text-sm" },
} as const;

/** People are round, agents are square (rounded-md) and show a 2-letter `code`. */
export function Avatar({
  name,
  avatarUrl,
  agent,
  code,
  size = 24,
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  agent?: boolean;
  code?: string;
  size?: 20 | 24 | 32;
  className?: string;
}) {
  const sz = SIZES[size];
  const base = `${sz.box} shrink-0 ${agent ? "rounded-md" : "rounded-full"} ${className}`;
  if (!agent && avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${base} object-cover`}
      />
    );
  }
  if (agent) {
    return (
      <span
        aria-hidden
        className={`${base} grid place-items-center bg-zinc-700 font-semibold text-zinc-100 ${sz.text}`}
      >
        {code ?? "AG"}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`${base} grid place-items-center font-semibold uppercase text-white ${sz.text} ${COLORS[hash(name) % COLORS.length]}`}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
