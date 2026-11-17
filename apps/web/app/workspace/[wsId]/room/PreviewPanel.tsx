"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { LOGO } from "./logos";
import { setupPrompt } from "@/lib/previewSetup";

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
    changes: { who: string; message: string; at: string; sha?: string }[];
    files: string[];
  } | null;
};

type Props = {
  draft: DraftInfo | null;
  reloadKey: number;
  /** Left of the title: the menu button on small screens. */
  lead?: ReactNode;
  /** Right of the top bar: the person's picture menu. */
  trail?: ReactNode;
  avatars: Map<string, string | null>;
  onSaveLinks: (patch: { previewUrl?: string; liveUrl?: string }) => Promise<string | null>;
  onGoLive: (upTo?: string) => Promise<string | null>;
  /** Your own agent's name, if you have one in the room. */
  agent?: string | null;
  /** Leaves a request for your agent to set up the preview on this host. */
  onAskAgent: (host: string) => Promise<string | null>;
};

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1";
const ghost = `inline-flex h-9 items-center justify-center rounded border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 ${focus}`;
const solid = `inline-flex h-9 items-center justify-center rounded bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 ${focus}`;
const iconBtn = `grid h-8 w-8 place-items-center rounded border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 disabled:opacity-40 ${focus}`;

/** A faint colourless mesh behind the browser, so the team's own page is the colour on screen. */
const MESH: React.CSSProperties = {
  background: [
    "linear-gradient(rgba(0,0,0,0.055) 1px, transparent 1px) 0 0 / 28px 28px",
    "linear-gradient(90deg, rgba(0,0,0,0.055) 1px, transparent 1px) 0 0 / 28px 28px",
    "radial-gradient(42% 52% at 22% 28%, #d4d4d0 0, transparent 70%)",
    "radial-gradient(46% 56% at 82% 78%, #c9c9c5 0, transparent 70%)",
    "#f5f5f3",
  ].join(", "),
};

const HOSTS = [
  {
    key: "vercel",
    name: "Vercel",
    hint: "In Vercel, open the project, then Deployments, and copy the link of the newest one for draft.",
    icon: <path d={LOGO.vercel} />,
  },
  {
    key: "railway",
    name: "Railway",
    hint: "In Railway, add a second copy of the app that follows draft, then copy its public link from Settings.",
    icon: <path d={LOGO.railway} />,
  },
  {
    key: "cloudflare",
    name: "Cloudflare",
    hint: "In Cloudflare Pages, open the project, then Deployments, and copy the link shown for the draft branch.",
    icon: <path d={LOGO.cloudflare} />,
  },
  {
    key: "netlify",
    name: "Netlify",
    hint: "In Netlify, turn on branch deploys for draft, then copy the draft link from Deploys.",
    icon: <path d={LOGO.netlify} />,
  },
] as const;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function whyNot(d: DraftInfo): string {
  if (!d.connected) return "Sign in with GitHub to publish";
  const s = d.status;
  if (!s || s.state === "no-draft") return "Nothing saved yet";
  if (s.state === "no-access") return "Your GitHub account cannot see this project";
  return "Everything is public";
}

/** The Preview tab: the team's work so far in a browser, with what is new listed underneath. */
export function PreviewPanel({ draft, reloadKey, lead, trail, avatars, onSaveLinks, onGoLive, agent, onAskAgent }: Props) {
  const [iframeKey, setIframeKey] = useState(0);
  const [view, setView] = useState<View>("desktop");
  const [listH, setListH] = useState(190);
  const dragFrom = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {
    try {
      const h = Number(localStorage.getItem("as:preview-list"));
      if (h) setListH(clampH(h));
      if (localStorage.getItem("as:preview-view") === "phone") setView("phone");
    } catch {
      /* private window */
    }
  }, []);
  function pickView(v: View) {
    setView(v);
    try {
      localStorage.setItem("as:preview-view", v);
    } catch {
      /* private window */
    }
  }
  const [editing, setEditing] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const [previewIn, setPreviewIn] = useState("");
  const [liveIn, setLiveIn] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [goErr, setGoErr] = useState<string | null>(null);
  const [justLive, setJustLive] = useState(false);
  const [later, setLater] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [sure, setSure] = useState(false);
  const [copied, setCopied] = useState(false);
  const [asked, setAsked] = useState(false);
  useEffect(() => setAsked(false), [host]);
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

  const [holdRaw, setHoldRaw] = useState(0);
  const ahead = draft?.status?.state === "ready" ? draft.status.ahead : 0;
  // "Not Yet" lasts until something new arrives.
  useEffect(() => {
    setLater(false);
    setHoldRaw(0);
  }, [ahead]);

  const previewUrl = draft?.previewUrl ?? null;
  const showSetup = !!draft && (editing || (!previewUrl && !skipped));
  const canGo = ahead > 0 && !!draft?.connected && !running;
  const rows = (draft?.status?.changes ?? []).filter((c) => !/^Merge /.test(c.message));
  // Ticks: publishing goes up to a point in time, so unticking a row also unticks everything
  // newer, and ticking one ticks everything older. `hold` counts the newest rows left for later.
  const maxHold = rows.length > 1 && rows.every((c) => c.sha) ? rows.length - 1 : 0;
  const hold = Math.min(holdRaw, maxHold);

  function startEdit() {
    setPreviewIn(draft?.previewUrl ?? "");
    setLiveIn(draft?.liveUrl ?? "");
    setLinkErr(null);
    setHost("other");
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
    setHost(null);
  }

  // The link belongs to the room, so removing it removes the preview for the whole team.
  async function disconnect() {
    setSaving(true);
    setLinkErr(null);
    const err = await onSaveLinks({ previewUrl: "" });
    setSaving(false);
    setSure(false);
    if (err) return setLinkErr(err);
    setPreviewIn("");
    setEditing(false);
    setHost(null);
    setSkipped(false);
  }

  async function publish() {
    setRunning(true);
    setGoErr(null);
    const err = await onGoLive(hold > 0 ? rows[hold]?.sha : undefined);
    setRunning(false);
    if (err) return setGoErr(err);
    setJustLive(true);
    liveTimer.current = setTimeout(() => setJustLive(false), 4000);
  }

  const picked = HOSTS.find((h) => h.key === host);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white text-zinc-900" style={{ colorScheme: "light" }}>
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-zinc-200 px-3.5">
        {lead}
        <h1 className="text-[15px] font-bold">Preview</h1>
        {previewUrl && !editing && (
          <div role="group" aria-label="Screen size" className="ml-1 flex gap-0.5 rounded border border-zinc-300 p-0.5">
            {(["desktop", "phone"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => pickView(v)}
                className={`h-6 rounded-sm px-2 text-xs font-semibold ${view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"} ${focus}`}
              >
                {v === "desktop" ? "Desktop" : "Phone"}
              </button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        {previewUrl && !showSetup && (
          <>
            <button type="button" className={iconBtn} aria-label="Refresh" title="Refresh" onClick={() => setIframeKey((k) => k + 1)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 11a8 8 0 1 0-2.3 6.3" />
                <path d="M20 4v7h-7" />
              </svg>
            </button>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className={iconBtn} aria-label="Open in a new tab" title="Open in a new tab">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
            <button type="button" className={iconBtn} aria-label="Change link" title="Change link" onClick={startEdit}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
              </svg>
            </button>
          </>
        )}
        {trail}
      </header>

      <div className="flex min-h-0 flex-1 p-4 sm:px-7 sm:py-5" style={MESH}>
        {!draft ? (
          <p className="m-auto text-sm text-zinc-500">Loading…</p>
        ) : showSetup ? (
          <div className="m-auto flex w-full max-w-[620px] flex-col items-center gap-7">
            <h2 className="text-center text-[28px] font-bold tracking-tight">Where does it run?</h2>
            {!host ? (
              <>
                <div className="grid w-full grid-cols-2 gap-3.5 sm:grid-cols-4">
                  {HOSTS.map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      onClick={() => setHost(h.key)}
                      className={`flex aspect-square flex-col items-center justify-center gap-3.5 rounded-md border border-zinc-200 bg-white hover:border-zinc-900 ${focus}`}
                    >
                      <svg viewBox="0 0 24 24" className="h-11 w-11" fill="currentColor" aria-hidden>
                        {h.icon}
                      </svg>
                      <span className="text-[15px] font-semibold">{h.name}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2.5">
                  <button type="button" className={ghost} onClick={() => setHost("other")}>
                    Paste a Link
                  </button>
                  <button
                    type="button"
                    className={`h-9 rounded px-4 text-sm font-semibold text-zinc-500 hover:text-zinc-900 ${focus}`}
                    onClick={() => {
                      setSkipped(true);
                      setEditing(false);
                    }}
                  >
                    Skip
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-4">
                {picked && setupPrompt(picked.key) && (
                  <div className="mb-4 border-b border-zinc-200 pb-4">
                    <p className="text-sm font-semibold">Let your agent set it up</p>
                    {asked ? (
                      <p role="status" className="mt-1 text-sm text-zinc-700">
                        Sent to {agent}. Say anything to it, even just <span className="font-semibold">go</span>, and it starts. The preview shows up here by itself.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">
                        It sets up {picked.name}, and the preview shows up here for the whole team by itself.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {agent && !asked && (
                        <button
                          type="button"
                          disabled={saving}
                          className={solid}
                          onClick={async () => {
                            setLinkErr(null);
                            const err = await onAskAgent(picked.key);
                            if (err) setLinkErr(err);
                            else setAsked(true);
                          }}
                        >
                          Ask {agent} to Set It Up
                        </button>
                      )}
                      <button
                        type="button"
                        className={agent && !asked ? ghost : asked ? ghost : solid}
                        onClick={() => {
                          void navigator.clipboard?.writeText(setupPrompt(picked.key) ?? "").then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          });
                        }}
                      >
                        {copied ? "Copied" : agent ? "Copy Instead" : "Copy for My Agent"}
                      </button>
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Or paste the link yourself</p>
                  </div>
                )}
                <label className="block text-sm font-semibold" htmlFor="pv-link">
                  {picked ? `Your ${picked.name} link` : "Link to your team's work in progress"}
                </label>
                {picked && <p className="mt-1 text-xs text-zinc-500">{picked.hint}</p>}
                <input
                  id="pv-link"
                  autoFocus
                  value={previewIn}
                  onChange={(e) => setPreviewIn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void save()}
                  placeholder="https://"
                  inputMode="url"
                  className="mt-2 w-full rounded border border-zinc-300 bg-white px-2.5 py-2 text-sm outline-none placeholder:text-zinc-400 focus-visible:border-zinc-900"
                />
                <label className="mt-3 block text-xs text-zinc-600" htmlFor="pv-live">
                  Public site link (optional)
                </label>
                <input
                  id="pv-live"
                  value={liveIn}
                  onChange={(e) => setLiveIn(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void save()}
                  placeholder="https://"
                  inputMode="url"
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2.5 py-2 text-sm outline-none placeholder:text-zinc-400 focus-visible:border-zinc-900"
                />
                {linkErr && <p className="mt-2 text-xs text-red-600">{linkErr}</p>}
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={saving} onClick={() => void save()} className={solid}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className={ghost}
                    onClick={() => {
                      setHost(null);
                      if (previewUrl) setEditing(false);
                    }}
                  >
                    Back
                  </button>
                  {previewUrl && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => (sure ? void disconnect() : setSure(true))}
                      onBlur={() => setSure(false)}
                      className={`ml-auto inline-flex h-9 items-center rounded px-3 text-sm font-semibold ${sure ? "bg-red-600 text-white hover:bg-red-700" : "text-red-600 hover:bg-red-50"} ${focus}`}
                    >
                      {sure ? "Disconnect for Everyone" : "Disconnect"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : previewUrl ? (
          <Browser url={previewUrl} reloadKey={iframeKey} view={view} />
        ) : (
          <button type="button" className={`${ghost} m-auto`} onClick={() => setSkipped(false)}>
            Add a Preview Link
          </button>
        )}
      </div>

      <section aria-label="New" className="relative flex shrink-0 flex-col border-t border-zinc-200 bg-white" style={{ height: listH }}>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the list"
          aria-valuenow={listH}
          aria-valuemin={52}
          aria-valuemax={520}
          tabIndex={0}
          title="Drag to resize"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            dragFrom.current = { y: e.clientY, h: listH };
          }}
          onPointerMove={(e) => {
            const d = dragFrom.current;
            if (d) setListH(clampH(d.h + d.y - e.clientY));
          }}
          onPointerUp={() => {
            dragFrom.current = null;
            try {
              localStorage.setItem("as:preview-list", String(listH));
            } catch {
              /* private window */
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") setListH((h) => clampH(h + 24));
            else if (e.key === "ArrowDown") setListH((h) => clampH(h - 24));
            else return;
            e.preventDefault();
          }}
          className="group/grip absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-row-resize touch-none items-center justify-center focus-visible:outline-none"
        >
          <span className="h-1 w-9 rounded-full bg-zinc-300 group-hover/grip:bg-zinc-900 group-focus-visible/grip:bg-zinc-900" />
        </div>
        <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 px-3.5 py-2">
          {!draft ? null : justLive ? (
            <span className="font-bold" aria-live="polite">
              Published
            </span>
          ) : ahead > 0 ? (
            <>
              <span className="font-bold">{hold > 0 ? `${rows.length - hold} of ${rows.length}` : `${ahead} new`}</span>
              {!later && <span className="text-zinc-500">Looks good?</span>}
            </>
          ) : (
            <span className="text-zinc-500">{whyNot(draft)}</span>
          )}
          {goErr && (
            <span role="alert" className="text-sm text-red-600">
              {goErr}
            </span>
          )}
          <span className="flex-1" />
          {ahead > 0 && !justLive && (
            <>
              {!later && (
                <button type="button" className={ghost} disabled={running} onClick={() => setLater(true)}>
                  Not Yet
                </button>
              )}
              <span className="group relative inline-flex">
                <button type="button" className={solid} disabled={!canGo} onClick={() => void publish()} aria-describedby="publish-tip">
                  {running ? "Publishing…" : "Publish"}
                </button>
                <span
                  id="publish-tip"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-[calc(100%+10px)] right-0 hidden whitespace-nowrap rounded bg-zinc-900 px-3 py-2 text-xs font-medium text-white group-focus-within:block group-hover:block"
                >
                  Sends your team&apos;s changes to the public site
                </span>
              </span>
            </>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((c, i) => (
              <li key={i} className={`flex min-h-9 items-center gap-3 px-3.5 text-sm ${i ? "border-t border-zinc-200" : ""}`}>
                {maxHold > 0 && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={i >= hold}
                    aria-label={`Publish: ${c.message || "Saved work"}`}
                    title={i >= hold ? "Leave this and anything newer for later" : "Publish this and everything before it"}
                    onClick={() => setHoldRaw(i >= hold ? Math.min(i + 1, maxHold) : i)}
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm border ${i >= hold ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-400 bg-white text-transparent hover:border-zinc-900"} ${focus}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </button>
                )}
                <span className={`flex min-w-0 flex-1 items-center gap-3 ${i < hold ? "opacity-40" : ""}`} style={{ transition: "opacity 0.15s" }}>
                  <Avatar name={c.who} avatarUrl={avatars.get(c.who)} size={20} />
                  <span className="min-w-0 flex-1 truncate font-semibold" title={c.message}>
                    {c.message === "Saved turn" || !c.message ? "Saved work" : c.message}
                  </span>
                  <span className="w-28 shrink-0 truncate text-[13px] text-zinc-500">{i < hold ? "Later" : c.who}</span>
                  <span className="w-10 shrink-0 text-right text-[13px] text-zinc-500">{ago(c.at)}</span>
                </span>
              </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const clampH = (h: number) => Math.max(52, Math.min(520, Math.round(h)));

// The page inside a 14-inch MacBook Pro browser window, and an iPhone 17 screen, in CSS pixels.
const SIZES = { desktop: { w: 1512, h: 862 }, phone: { w: 402, h: 874 } } as const;
type View = keyof typeof SIZES;
const BAR = 37;

/**
 * The little browser. The page is laid out at the real size of that screen and the whole
 * thing is scaled down to fit, so proportions are always true. It opens signed out:
 * `credentialless` gives it a fresh, empty session that is thrown away when it closes.
 */
function Browser({ url, reloadKey, view }: { url: string; reloadKey: number; view: View }) {
  const box = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size = SIZES[view];
  const phone = view === "phone";
  // The desktop keeps its browser bar, which is not scaled; the phone is all screen.
  const bar = phone ? 0 : BAR;
  const scale = room.w ? Math.min(1, room.w / size.w, Math.max(room.h - bar - 2, 0) / size.h) : 0;

  return (
    <div ref={box} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
      {scale > 0 && (
        <div
          className="flex shrink-0 flex-col overflow-hidden border border-zinc-300 bg-white shadow-[0_34px_70px_-24px_rgba(0,0,0,0.30),0_10px_24px_-10px_rgba(0,0,0,0.14)]"
          style={{ width: size.w * scale + 2, borderRadius: phone ? 44 * scale : 4 }}
        >
          {!phone && (
            <div className="flex shrink-0 items-center gap-1.5 border-b border-zinc-200 px-3" style={{ height: BAR }}>
              <span className="h-[9px] w-[9px] rounded-full bg-zinc-300" />
              <span className="h-[9px] w-[9px] rounded-full bg-zinc-300" />
              <span className="h-[9px] w-[9px] rounded-full bg-zinc-300" />
              <span className="ml-2 min-w-0 flex-1 truncate text-xs text-zinc-500">{url.replace(/^https?:\/\//, "")}</span>
            </div>
          )}
          <div className="overflow-hidden" style={{ width: size.w * scale, height: size.h * scale }}>
            <iframe
              key={`${reloadKey}-${view}`}
              src={url}
              title="Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              {...{ credentialless: "" }}
              className="border-0 bg-white"
              style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
