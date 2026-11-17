const card = "mt-1 max-w-[72ch] rounded border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800";
const label = "text-[11px] uppercase tracking-wide text-zinc-500";

/** One agent turn: what was asked for as the title, then the files it touched. */
export function AgentNote({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  const files = lines.find((l) => l.startsWith("Changed:"))?.slice(8).trim() ?? "";
  const rest = lines.filter((l) => !l.startsWith("Changed:"));
  return (
    <div className={card}>
      {rest.length > 0 && <div className="whitespace-pre-wrap break-words font-semibold text-zinc-900">{rest.join("\n")}</div>}
      {files && (
        <div className={rest.length ? "mt-2" : ""}>
          <div className={label}>Changed</div>
          <ul className="mt-0.5">
            {files.split(", ").map((f) => (
              <li key={f} className="break-all font-mono text-xs leading-5 text-zinc-700">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A published update, or the plan the first agent wrote. */
export function UpdateCard({ title, items, text }: { title: string; items?: { what: string; who: string }[] | null; text?: string }) {
  return (
    <div className={card}>
      <div className="text-base font-bold text-zinc-900">{title}</div>
      {items?.length ? (
        <>
          <div className={`mt-2 ${label}`}>Published</div>
          <ul className="mt-0.5">
            {items.map((i, k) => (
              <li key={k} className="flex items-baseline gap-2 leading-6">
                <span aria-hidden className="text-zinc-400">
                  ✓
                </span>
                <span className="min-w-0 flex-1 break-words">{i.what}</span>
                <span className="shrink-0 text-xs text-zinc-500">{i.who}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-1 whitespace-pre-wrap break-words">{text}</div>
      )}
    </div>
  );
}
