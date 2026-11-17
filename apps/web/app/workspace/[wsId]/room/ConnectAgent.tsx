"use client";

import { useEffect, useRef, useState } from "react";

const KINDS = [
  { kind: "claude", label: "Claude Code" },
  { kind: "codex", label: "Codex" },
  { kind: "gemini", label: "Gemini CLI" },
];

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
function agentMessage(origin: string, token: string, first: boolean): string {
  const lines = [
    "Connect this project to my team room. Run this in the project folder:",
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
    "When that is done, tell me to restart you once (exit, then run: claude --continue) so automatic saving and teammate warnings switch on.",
  );
  return lines.join("\n");
}

/** Pick an agent, get a one-time command to paste in a terminal. */
export function ConnectAgent({
  wsId,
  headers,
  onClose,
  mode = "default",
  connected = false,
  askPurpose = false,
}: {
  /** True when this person already has an agent here: ask what the new one is for. */
  askPurpose?: boolean;
  wsId: string;
  headers: HeadersInit;
  onClose: () => void;
  /** "first": onboarding copy, command also starts the agent on its first task. */
  mode?: "default" | "first";
  /** first mode: true once the first message has arrived in #prd. */
  connected?: boolean;
}) {
  const first = mode === "first";
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [made, setMade] = useState<{ kind: string; token: string } | null>(null);
  /** "agent": a message for a running agent. "terminal": a command to paste. */
  const [via, setVia] = useState<"agent" | "terminal">("agent");
  const canTell = made?.kind === "claude";
  const cmd = !made
    ? ""
    : canTell && via === "agent"
      ? agentMessage(window.location.origin, made.token, first)
      : command(made.kind, window.location.origin, made.token, first);
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!first || !connected) return;
    const t = setTimeout(() => onCloseRef.current(), 1500);
    return () => clearTimeout(t);
  }, [first, connected]);

  async function choose(kind: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${wsId}/agents`, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind, purpose: askPurpose ? purpose : undefined }),
      });
      if (!res.ok) throw new Error();
      const { token } = (await res.json()) as { token: string };
      setMade({ kind, token });
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
    } catch {
      setError("Copy failed. Select the command and copy it.");
    }
  }

  const skip = (
    <button
      type="button"
      onClick={onClose}
      className="text-xs text-zinc-500 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      Skip for now
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-zinc-100 shadow-xl"
      >
        {first && connected ? (
          <p className="py-6 text-center text-sm font-medium">Your agent is connected.</p>
        ) : cmd ? (
          <>
            {canTell && (
              <div role="tablist" aria-label="How to connect" className="mb-3 flex gap-1 rounded-lg bg-zinc-950 p-1">
                {(
                  [
                    ["agent", "Tell your agent"],
                    ["terminal", "Use the terminal"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={via === key}
                    onClick={() => {
                      setVia(key);
                      setCopied(false);
                    }}
                    className={`h-9 flex-1 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      via === key ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <h2 className="mb-3 text-sm font-semibold">
              {canTell && via === "agent"
                ? "Paste this to the agent already working on your project."
                : first
                  ? "Run this in your project folder."
                  : "Paste this in your terminal"}
            </h2>
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
              {cmd}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-zinc-500">This key is shown once.</span>
              <button
                type="button"
                autoFocus
                onClick={() => void copy()}
                className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            {first ? (
              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  Waiting for your agent…
                </span>
                {skip}
              </div>
            ) : (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Done
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-sm font-semibold">
              {first ? "Connect your agent" : "Connect an agent"}
            </h2>
            {first && (
              <p className="mb-3 mt-1 text-xs text-zinc-400">
                It will read your project and write a short summary for the room.
              </p>
            )}
            {!first && <div className="mb-3" />}
            {askPurpose && (
              <label className="mb-3 block text-xs text-zinc-400">
                You already have an agent here. What is this one for?
                <input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  maxLength={24}
                  placeholder="website"
                  className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                />
              </label>
            )}
            <div className="flex flex-col gap-2">
              {KINDS.map((k, i) => (
                <button
                  key={k.kind}
                  ref={i === 0 ? firstRef : undefined}
                  type="button"
                  disabled={busy}
                  onClick={() => void choose(k.kind)}
                  className="rounded border border-zinc-700 px-3 py-2 text-left text-sm hover:bg-zinc-800 disabled:opacity-60"
                >
                  {k.label}
                </button>
              ))}
            </div>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            {first && <div className="mt-3 flex justify-end">{skip}</div>}
          </>
        )}
      </div>
    </div>
  );
}
