"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";

const item =
  "flex h-10 w-full items-center rounded px-3 text-left text-sm font-medium hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900";

const PENCIL = "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4";

/** Shrinks any picture to a small centred square, so it is quick to load everywhere. */
async function squarePicture(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 160;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("no canvas");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 160, 160);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Your picture, top right. Opens a small menu: your picture, your name, sign out. */
export function AccountMenu({
  name,
  avatarUrl,
  headers,
  onRenamed,
}: {
  name: string;
  avatarUrl?: string | null;
  headers: HeadersInit;
  onRenamed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setError("");
    }
  }, [open]);

  async function save() {
    const next = draft.trim();
    if (!next || next === name) return setEditing(false);
    setError("");
    const res = await fetch("/api/me/profile", { method: "PATCH", headers, body: JSON.stringify({ name: next }) });
    if (!res.ok) return setError("Could not save the name.");
    setEditing(false);
    onRenamed();
  }

  async function changePicture(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const picture = await squarePicture(file);
      const res = await fetch("/api/me/profile", { method: "PATCH", headers, body: JSON.stringify({ picture }) });
      if (!res.ok) throw new Error();
      onRenamed();
    } catch {
      setError("That picture did not work. Try another one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Your account"
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
      >
        <Avatar name={name || "?"} avatarUrl={avatarUrl} size={32} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-64 rounded-md border border-zinc-900 bg-white p-2 text-zinc-900">
          <div className="flex items-center gap-3 px-2 pb-3 pt-2">
            <button
              type="button"
              aria-label="Change your picture"
              title="Change your picture"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="group/pic relative shrink-0 overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
            >
              <Avatar name={name || "?"} avatarUrl={avatarUrl} size={44} />
              <span
                className={`absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white transition-opacity duration-150 group-hover/pic:opacity-100 group-focus-visible/pic:opacity-100 ${busy ? "opacity-100" : "opacity-0"}`}
              >
                {busy ? (
                  <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={PENCIL} />
                  </svg>
                )}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void changePicture(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {editing ? (
              <input
                autoFocus
                value={draft}
                maxLength={40}
                aria-label="Your name"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void save()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditing(false);
                  }
                }}
                className="min-w-0 flex-1 rounded bg-zinc-100 px-2 py-1 text-[15px] font-semibold outline-none"
              />
            ) : (
              <button
                type="button"
                title="Change your name"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                className="group/name -mx-0 flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-[15px] font-semibold hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
              >
                <span className="truncate">{name}</span>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-zinc-500 opacity-0 group-hover/name:opacity-100 group-focus-visible/name:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={PENCIL} />
                </svg>
              </button>
            )}
          </div>
          {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
          <div className="mx-1 mb-1 border-t border-zinc-200" />
          <button
            type="button"
            role="menuitem"
            className={`${item} text-red-700`}
            onClick={async () => {
              try {
                await fetch("/api/auth/logout", { method: "POST" });
              } finally {
                window.location.href = "/";
              }
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
