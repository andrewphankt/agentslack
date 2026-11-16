const PREFIXES = ["Changed", "Decided", "Files"] as const;

/** Agent message body: a card, with Changed/Decided/Files line prefixes as small labels. */
export function AgentNote({ text }: { text: string }) {
  return (
    <div className="mt-1 space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
      {text.split("\n").map((line, i) => {
        const p = PREFIXES.find((x) => line.startsWith(`${x}:`));
        if (!p) {
          return (
            <div key={i} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          );
        }
        const value = line.slice(p.length + 1).trim();
        return (
          <div key={i} className="flex items-baseline gap-2">
            <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">
              {p}
            </span>
            <span
              className={`min-w-0 break-words ${p === "Files" ? "font-mono text-xs" : ""}`}
            >
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
