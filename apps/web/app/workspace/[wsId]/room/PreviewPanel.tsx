"use client";

import { useEffect, useRef, useState } from "react";

export type DraftInfo = {
  repo: string | null;
  previewUrl: string | null;
  liveUrl: string | null;
  lastLiveAt: string | null;
  lastLiveBy: string | null;
  connected: boolean;
  status: {
    state: "ready" | "nothing" | "no-draft" | "no-access";
    ahead: number;
    behind: number;
    changes: { who: string; message: string; at: string }[];
    files: string[];
  } | null;
};

type Props = {
  draft: DraftInfo | null;
  reloadKey: number;
  onClose: () => void;
  onSaveLinks: (patch: { previewUrl?: string; liveUrl?: string }) => Promise<string | null>;
  onGoLive: () => Promise<string | null>;
};

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";
const ghost = `rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 ${focus}`;
const input = `w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500`;

function statusLine(d: DraftInfo | null): string {
  if (!d) return "";
  if (!d.connected) return "Sign in with GitHub to go live";
  const s = d.status;
  if (!s || s.state === "no-draft") return "No shared draft yet";
  if (s.state === "no-access") return "Your GitHub account cannot see this repo";
  if (s.state === "nothing") return "Everything is live";
  return `${s.ahead} ${s.ahead === 1 ? "change" : "changes"} not live yet`;
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5V6h-2.5" />
    </svg>
  );
}

export function PreviewPanel({ draft, reloadKey, onClose, onSaveLinks, onGoLive }: Props) {
  const [iframeKey, setIframeKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [previewIn, setPreviewIn] = useState("");
  const [liveIn, setLiveIn] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [goErr, setGoErr] = useState<string | null>(null);
  const [justLive, setJustLive] = useState(false);
  const goBtnRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parent bumps reloadKey after a change reaches the room.
  useEffect(() => {
    if (reloadKey > 0) setIframeKey((k) => k + 1);
  }, [reloadKey]);

  useEffect(
    () => () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
    },
    []
  );

  const previewUrl = draft?.previewUrl ?? null;
  const showSetup = !!draft && (!previewUrl || editing);
  const canGo = draft?.status?.state === "ready" && draft.connected && !running;

  function startEdit() {
    setPreviewIn(draft?.previewUrl ?? "");
    setLiveIn(draft?.liveUrl ?? "");
    setLinkErr(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setLinkErr(null);
    const patch: { previewUrl?: string; liveUrl?: string } = { previewUrl: previewIn.trim() };
    if (editing || liveIn.trim() || draft?.liveUrl) patch.liveUrl = liveIn.trim();
    const err = await onSaveLinks(patch);
    setSaving(false);
    if (err) return setLinkErr(err);
    setEditing(false);
  }

  function openConfirm() {
    setGoErr(null);
    setConfirm(true);
  }

  function closeConfirm() {
    if (running) return;
    setConfirm(false);
    goBtnRef.current?.focus();
  }

  useEffect(() => {
    if (confirm) cancelRef.current?.focus();
  }, [confirm]);

  async function run() {
    setRunning(true);
    setGoErr(null);
    const err = await onGoLive();
    setRunning(false);
    if (err) return setGoErr(err);
    setConfirm(false);
    setJustLive(true);
    liveTimer.current = setTimeout(() => setJustLive(false), 3000);
    goBtnRef.current?.focus();
  }

  function dialogKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeConfirm();
      return;
    }
    if (e.key !== "Tab") return;
    const els = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
    if (!els || !els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const changes = draft?.status?.changes ?? [];
  const shown = changes.slice(0, 6);
  const more = (draft?.status?.ahead ?? changes.length) - shown.length;

  return (
    <aside
      aria-label="Draft preview"
      className="absolute inset-0 z-10 flex min-w-0 flex-col bg-white text-zinc-900 lg:static lg:z-auto lg:w-[440px] lg:shrink-0 lg:border-l lg:border-zinc-200"
      style={{ colorScheme: "light" }}
    >
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Draft preview</h2>
            {previewUrl && <p className="truncate text-xs text-zinc-500" title={previewUrl}>{previewUrl}</p>}
            <p className="text-xs text-zinc-600" aria-live="polite">
              {justLive ? "Live" : statusLine(draft)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className={`-mr-1 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 ${focus}`}
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${ghost} inline-flex items-center gap-1.5`}
            disabled={!previewUrl}
            onClick={() => setIframeKey((k) => k + 1)}
          >
            <IconRefresh />
            Refresh
          </button>
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className={ghost}>
              Open
            </a>
          ) : (
            <button type="button" className={ghost} disabled>
              Open
            </button>
          )}
          {previewUrl && !editing && (
            <button type="button" className={ghost} onClick={startEdit}>
              Change link
            </button>
          )}
          <button
            ref={goBtnRef}
            type="button"
            disabled={!canGo}
            onClick={openConfirm}
            className={`ml-auto rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 ${focus}`}
          >
            {justLive ? "Live" : "Go live"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-zinc-50">
        {!draft ? (
          <p className="p-4 text-sm text-zinc-500">Loading…</p>
        ) : showSetup ? (
          <div className="p-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-sm font-medium">Add the link where your draft is hosted.</p>
              <label className="mt-3 block text-xs text-zinc-600" htmlFor="pv-link">
                Draft link
              </label>
              <input
                id="pv-link"
                value={previewIn}
                onChange={(e) => setPreviewIn(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void save()}
                placeholder="https://"
                inputMode="url"
                className={input}
              />
              <p className="mt-1 text-xs text-zinc-500">
                On Vercel this looks like your-project-git-draft-your-team.vercel.app
              </p>
              <label className="mt-3 block text-xs text-zinc-600" htmlFor="pv-live">
                Live site link (optional)
              </label>
              <input
                id="pv-live"
                value={liveIn}
                onChange={(e) => setLiveIn(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void save()}
                placeholder="https://"
                inputMode="url"
                className={input}
              />
              {linkErr && <p className="mt-2 text-xs text-red-600">{linkErr}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className={`rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60 ${focus}`}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {editing && (
                  <button type="button" className={ghost} onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <iframe
            key={iframeKey}
            src={previewUrl ?? undefined}
            title="Draft preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className="h-full w-full border-0 bg-white"
          />
        )}
      </div>

      {confirm && (
        <div
          className="absolute inset-0 z-20 grid place-items-center bg-black/40 p-4"
          onKeyDown={dialogKey}
          onMouseDown={(e) => e.target === e.currentTarget && closeConfirm()}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="golive-title"
            className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl"
          >
            <h3 id="golive-title" className="text-base font-semibold">
              Send the draft live?
            </h3>
            {shown.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {shown.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 font-medium">{c.who}</span>
                    <span className="min-w-0 truncate text-zinc-600" title={c.message}>
                      {c.message}
                    </span>
                  </li>
                ))}
                {more > 0 && <li className="text-zinc-500">+{more} more</li>}
              </ul>
            )}
            <p className="mt-3 text-sm text-zinc-700">Everyone&apos;s saved work goes to the real site.</p>
            {goErr && (
              <p role="alert" className="mt-3 rounded bg-red-50 px-2 py-1.5 text-sm text-red-700">
                {goErr}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button ref={cancelRef} type="button" className={ghost} onClick={closeConfirm} disabled={running}>
                Cancel
              </button>
              <button
                type="button"
                disabled={running}
                onClick={() => void run()}
                className={`rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 ${focus}`}
              >
                {running ? "Going live…" : "Go live"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
