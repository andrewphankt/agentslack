"use client";

import { useEffect, useRef, useState } from "react";
import { EMBED_LABELS, githubRepo, kindFromUrl, youtubeId, type EmbedKind } from "@/lib/embeds";

const KINDS: EmbedKind[] = ["image", "video", "gif", "youtube", "github"];
const LINK_KINDS: EmbedKind[] = ["gif", "youtube", "github"];

const ACCENT: Record<EmbedKind, string> = {
  image: "#2a9e6e",
  video: "#7c3aed",
  gif: "#1a9e8f",
  youtube: "#FF0000",
  github: "#181717",
};

function Icon({ kind, size = 18 }: { kind: EmbedKind; size?: number }) {
  switch (kind) {
    case "youtube":
      return (
        <svg width={size * 1.4} height={size} viewBox="0 0 28 20" aria-hidden>
          <rect width="28" height="20" rx="5" fill="#FF0000" />
          <path d="M11 6l7 4-7 4z" fill="#fff" />
        </svg>
      );
    case "github":
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="#181717" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.32c-2.23.49-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
      );
    case "gif":
      return (
        <svg width={size * 1.55} height={size} viewBox="0 0 30 18" aria-hidden>
          <rect width="30" height="18" rx="4" fill="#1a9e8f" />
          <text x="15" y="13" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="800" fill="#fff">
            GIF
          </text>
        </svg>
      );
    case "video":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <path d="M10 9.5l5 2.5-5 2.5z" fill="#7c3aed" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2a9e6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <circle cx="8.5" cy="9.5" r="1.6" />
          <path d="M21 15l-4.5-4.5L6 21" />
        </svg>
      );
  }
}

const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/** The "+" button and its menu. Files go to `onFile`; pasted links go to `onLink`. */
export function MediaMenu({
  disabled,
  onFile,
  onLink,
}: {
  disabled: boolean;
  onFile: (file: File | undefined) => void;
  onLink: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [linkKind, setLinkKind] = useState<EmbedKind | null>(null);
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  function close(refocus = false) {
    setOpen(false);
    setLinkKind(null);
    setUrl("");
    setBad(false);
    if (refocus) btnRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  useEffect(() => {
    if (linkKind) urlRef.current?.focus();
  }, [linkKind]);

  function pick(kind: EmbedKind) {
    if (kind === "image") imgRef.current?.click();
    else if (kind === "video") vidRef.current?.click();
    else {
      setLinkKind(kind);
      setBad(false);
    }
  }

  function submit() {
    const v = url.trim();
    if (!v || !linkKind) return;
    const ok =
      /^https?:\/\//i.test(v) &&
      (linkKind === "youtube" ? !!youtubeId(v) : linkKind === "github" ? !!githubRepo(v) : kindFromUrl(v) === "gif" || /tenor\.com|giphy\.com/i.test(v));
    if (!ok) return setBad(true);
    onLink(v);
    close(true);
  }

  const spring = "cubic-bezier(0.34,1.28,0.64,1)";
  return (
    <div ref={rootRef} className="relative shrink-0">
      <input
        ref={imgRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
          close();
        }}
      />
      <input
        ref={vidRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
          close();
        }}
      />
      <div
        id="media-menu"
        role="group"
        aria-label="Add media"
        className="absolute bottom-full left-0 z-30 mb-2 flex w-max flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl"
        style={{
          transformOrigin: "bottom left",
          transform: open ? "scale(1) translateY(0)" : "scale(0.9) translateY(8px)",
          opacity: open ? 1 : 0,
          visibility: open ? "visible" : "hidden",
          transition: `opacity 0.16s ease, transform 0.2s ${spring}, visibility 0s linear ${open ? "0s" : "0.2s"}`,
        }}
      >
        <div className="flex max-w-[calc(100vw-2rem)] flex-wrap gap-1">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-label={LINK_KINDS.includes(kind) ? `${EMBED_LABELS[kind]} link` : `Add ${EMBED_LABELS[kind].toLowerCase()}`}
              aria-pressed={linkKind === kind}
              onClick={() => pick(kind)}
              className={`flex w-16 flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] font-medium text-zinc-800 hover:-translate-y-0.5 hover:bg-zinc-100 ${ring} ${
                linkKind === kind ? "border-zinc-300 bg-zinc-100" : "border-transparent"
              }`}
              style={{ transition: "background 0.12s, transform 0.1s" }}
            >
              <span className="flex h-6 items-center" style={{ color: ACCENT[kind] }}>
                <Icon kind={kind} size={22} />
              </span>
              {EMBED_LABELS[kind]}
            </button>
          ))}
        </div>
        {linkKind && (
          <div>
            <input
              ref={urlRef}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setBad(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Paste a link"
              aria-label={`${EMBED_LABELS[linkKind]} link`}
              aria-invalid={bad}
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            {bad && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                That is not a {EMBED_LABELS[linkKind]} link
              </p>
            )}
          </div>
        )}
      </div>
      <button
        ref={btnRef}
        type="button"
        aria-label="Add media"
        aria-expanded={open}
        aria-controls="media-menu"
        title="Add media (or paste or drop a file)"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        className={`grid h-10 w-10 place-items-center rounded-full text-2xl leading-none disabled:opacity-60 ${ring} ${
          open ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
        }`}
        style={{
          transform: open ? "rotate(135deg)" : "rotate(0deg)",
          transition: `transform 0.28s ${spring}, background 0.18s ease, color 0.18s ease`,
        }}
      >
        <span aria-hidden className="-mt-0.5">+</span>
      </button>
    </div>
  );
}
