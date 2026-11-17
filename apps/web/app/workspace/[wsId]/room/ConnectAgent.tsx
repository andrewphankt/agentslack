"use client";

import { useEffect, useRef, useState } from "react";
import { LOGO } from "./logos";

const KINDS = [
  { kind: "claude", label: "Claude Code", logo: LOGO.claude, color: "#D97757" },
  { kind: "codex", label: "Codex", logo: LOGO.openai, color: "#111111" },
  { kind: "gemini", label: "Gemini", logo: LOGO.googlegemini, color: "#8E75B2" },
] as const;

const FIRST_TASK = "Read this project and write a short PRD to the room with the write_prd tool.";

function command(kind: string, origin: string, token: string, first: boolean): string {
  if (kind === "claude")
    return (
      `curl -fsSL ${origin}/api/connect | sh -s -- ${token}` +
      (first ? ` && claude "${FIRST_TASK}"` : "")
    );
  if (kind === "codex")
    return (
      `export AGENTSLACK_TOKEN=${token} && codex mcp add agentslack --url ${origin}/api/mcp --bearer-token-env-var AGENTSLACK_TOKEN` +
      (first ? ` && codex "${FIRST_TASK}"` : "")
    );
  return (
    `gemini mcp add --transport http --header "Authorization: Bearer ${token}" agentslack ${origin}/api/mcp` +
    (first ? ` && gemini -i "${FIRST_TASK}"` : "")
  );
}

/** A message to paste to an agent that is already running in the project. */
function agentMessage(origin: string, token: string, first: boolean, repoUrl: string | null): string {
  const name = repoUrl?.split("/").pop() || "";
  const lines = [
    repoUrl
      ? `Connect this project to my team room. The project is ${repoUrl}. If this folder is not a copy of it yet, get it first: use an existing copy if you can find one, otherwise run git clone ${repoUrl} ~/Desktop/${name} and work inside that folder. Then run this in the project folder:`
      : "Connect this project to my team room. Run this in the project folder:",
    "",
    `curl -fsSL ${origin}/api/connect | sh -s -- ${token}`,
  ];
  if (first)
    lines.push(
      "",
      "Then read the project and post a short summary to the room (1 to 2 short paragraphs: what it is, who it is for, what exists so far) by running:",
      "",
      `curl -fsS -X POST ${origin}/api/hook/prd -H "Authorization: Bearer ${token}" --data-urlencode "text=YOUR SUMMARY HERE"`,
    );
  lines.push(
    "",
    "When that is done, reply with only this and nothing else:",
    "",
    `${name || "This project"} has been connected! Please:`,
    "1. /exit",
    "2. claude --continue",
    "to return and sync with your teammates.",
    "",
    "If you had to make a new folder, replace step 2 with: open Claude Code inside that folder (say which folder).",
    "If a step failed, say which one in a sentence or two instead.",
  );
  return lines.join("\n");
}

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2";
const big = `inline-flex h-[60px] items-center justify-center gap-3 rounded-md bg-zinc-900 px-10 text-lg font-semibold text-white hover:bg-zinc-700 ${focus}`;

function Tick({ size, className = "" }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Steps({ at }: { at: number }) {
  return (
    <ol className="flex items-center gap-3.5 text-sm font-semibold">
      {["Sign in", "Project", "Agent"].map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex items-center gap-3.5">
            {i > 0 && <span aria-hidden className="h-px w-8 bg-zinc-200" />}
            <span className={`flex items-center gap-2 ${n <= at ? "text-zinc-900" : "text-zinc-500"}`}>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                  n <= at ? "bg-zinc-900 text-white" : "border border-zinc-200"
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

/** Connect an agent in three screens: pick it, copy one message, see it connect. */
export function ConnectAgent({
  wsId,
  headers,
  onClose,
  mode = "default",
  onlineIds,
  roomName = "",
  summary = false,
}: {
  wsId: string;
  headers: HeadersInit;
  onClose: () => void;
  /** "first": the third step of setting up; the message also asks for a project summary. */
  mode?: "default" | "first";
  /** Ids of agents that are running right now. The page flips to the tick when ours shows up. */
  onlineIds: Set<string>;
  roomName?: string;
  /** Also ask the agent to post a short summary of the project (a brand new room). */
  summary?: boolean;
}) {
  const first = mode === "first";
  const [made, setMade] = useState<{ id: string; kind: string; token: string; repoUrl: string | null } | null>(null);
  const [terminal, setTerminal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  const kind = KINDS.find((k) => k.kind === made?.kind);
  const tell = made?.kind === "claude" && !terminal;
  const cmd = !made
    ? ""
    : tell
      ? agentMessage(window.location.origin, made.token, summary, made.repoUrl)
      : command(made.kind, window.location.origin, made.token, summary);
  const connected = !!made && onlineIds.has(made.id);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !first) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, first]);

  async function choose(k: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${wsId}/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: k }),
      });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { token: string; repoUrl?: string | null; agent: { id: string } };
      setMade({ id: j.agent.id, kind: k, token: j.token, repoUrl: j.repoUrl ?? null });
      setTerminal(false);
      setCopied(false);
    } catch {
      setError("Could not create the agent.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setError("");
    } catch {
      setError("Copy failed. Open the text below and copy it by hand.");
    }
  }

  const title = "text-center text-[28px] font-bold tracking-tight";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect your agent"
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-white px-6 py-7 text-zinc-900"
      style={{ colorScheme: "light" }}
    >
      <div className="flex w-full items-center justify-center">
        {first ? (
          <Steps at={connected ? 4 : 3} />
        ) : (
          <button type="button" onClick={onClose} aria-label="Close" className={`ml-auto grid h-9 w-9 place-items-center rounded border border-zinc-200 hover:bg-zinc-50 ${focus}`}>
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        )}
      </div>

      {connected ? (
        <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7" aria-live="polite">
          <span className="grid h-[88px] w-[88px] place-items-center rounded-full bg-zinc-900 text-white">
            <Tick size={46} />
          </span>
          <div className="flex flex-col items-center gap-2.5">
            <h2 className={title}>Connected</h2>
            <p className="flex items-center gap-2 text-zinc-500">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill={kind?.color} aria-hidden>
                <path d={kind?.logo} />
              </svg>
              {kind?.label}
              {roomName ? ` · ${roomName}` : ""}
            </p>
          </div>
          <button type="button" autoFocus onClick={onClose} className={big}>
            {first ? "Enter Room" : "Done"}
          </button>
        </div>
      ) : made ? (
        <div className="flex w-full max-w-[420px] flex-1 flex-col items-center justify-center gap-7">
          <div className="flex flex-col items-center gap-3.5">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill={kind?.color} aria-hidden>
              <path d={kind?.logo} />
            </svg>
            <h2 className={title}>{tell ? `Paste this into ${kind?.label}` : "Run this in your terminal"}</h2>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button type="button" autoFocus onClick={() => void copy()} className={big}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
              Copy
            </button>
            {made.kind === "claude" && (
              <p className="text-[13px] text-zinc-500">
                or{" "}
                <button
                  type="button"
                  onClick={() => {
                    setTerminal((v) => !v);
                    setCopied(false);
                  }}
                  className={`rounded text-zinc-900 underline ${focus}`}
                >
                  {terminal ? "paste it into Claude Code" : "run it in your terminal"}
                </button>
              </p>
            )}
          </div>
          <div className="w-full overflow-hidden rounded-md border border-zinc-200">
            <div className={`flex min-h-11 items-center gap-3 px-4 font-medium ${copied ? "" : "text-zinc-500"}`}>
              {copied ? (
                <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-zinc-900 text-white">
                  <Tick size={12} />
                </span>
              ) : (
                <span className="h-[18px] w-[18px] rounded-[5px] border border-zinc-300" />
              )}
              Copied
            </div>
            <div className="flex min-h-11 items-center gap-3 border-t border-zinc-200 px-4 font-medium text-zinc-500" aria-live="polite">
              <span aria-hidden className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900 motion-reduce:animate-none" />
              Waiting for {kind?.label}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <details className="w-full text-[13px] text-zinc-500">
            <summary className={`cursor-pointer rounded ${focus}`}>Show the text</summary>
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800">{cmd}</pre>
          </details>
          <div className="flex gap-5 text-[13px] text-zinc-500">
            <button type="button" onClick={() => setMade(null)} className={`rounded hover:text-zinc-900 ${focus}`}>
              Back
            </button>
            {first && (
              <button type="button" onClick={onClose} className={`rounded hover:text-zinc-900 ${focus}`}>
                Skip for Now
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-[560px] flex-1 flex-col items-center justify-center gap-7">
          <h2 className={title}>Which agent do you use?</h2>
          <div className="grid w-full grid-cols-3 gap-4">
            {KINDS.map((k, i) => (
              <button
                key={k.kind}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                disabled={busy}
                onClick={() => void choose(k.kind)}
                className={`flex aspect-square flex-col items-center justify-center gap-3.5 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 disabled:opacity-60 ${focus}`}
              >
                <svg viewBox="0 0 24 24" className="h-11 w-11" fill={k.color} aria-hidden>
                  <path d={k.logo} />
                </svg>
                <span className="text-[15px] font-semibold">{k.label}</span>
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {first && (
            <button type="button" onClick={onClose} className={`rounded text-[13px] text-zinc-500 hover:text-zinc-900 ${focus}`}>
              Skip for Now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
