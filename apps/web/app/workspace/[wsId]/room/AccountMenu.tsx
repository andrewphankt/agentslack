"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";

const item =
  "flex h-10 w-full items-center rounded px-3 text-left text-sm font-medium hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900";

/** Your picture, top right. Opens a small menu: change your name, rooms, sign out. */
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
  const boxRef = useRef<HTMLDivElement>(null);

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
    if (!open) setEditing(false);
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
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-md border border-zinc-900 bg-white p-2 text-zinc-900">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar name={name || "?"} avatarUrl={avatarUrl} size={32} />
            {editing ? (
              <input
                autoFocus
                value={draft}
                maxLength={40}
                aria-label="Your name"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void save()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditing(false);
                  }
                }}
                className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm outline-none focus-visible:border-zinc-900"
              />
            ) : (
              <button
                type="button"
                title="Change your name"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
              >
                <span className="truncate">{name}</span>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
                </svg>
              </button>
            )}
          </div>
          {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
          <div className="mx-1 mb-1 border-t border-zinc-200" />
          <Link role="menuitem" href="/?rooms=1" className={item}>
            Rooms
          </Link>
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
