"use client";

import { useEffect, useRef, useState } from "react";

/** Primary Invite button with a small popover holding the join link. */
export function Invite({
  inviteCode,
  roomName,
  people,
}: {
  inviteCode: string;
  roomName: string;
  /** Who is already in the room, shown as pictures. */
  people: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const link =
    typeof window !== "undefined" && inviteCode
      ? `${window.location.origin}/join/${inviteCode}`
      : "";

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

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setError("");
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
      setError("Press Ctrl/Cmd+C to copy.");
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
      >
        Invite
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Invite people"
          className="pop-in absolute right-0 top-full z-30 mt-2 w-80 rounded-md border border-zinc-900 bg-white p-4 text-zinc-900"
        >
          <h2 className="text-base font-bold">Invite to {roomName || "this room"}</h2>
          <p className="mt-1 text-sm text-zinc-600">Send this link. They sign in and land in the room.</p>
          <button
            type="button"
            autoFocus
            disabled={!link}
            onClick={() => void copy()}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {copied ? "Copied" : "Copy Invite Link"}
          </button>
          <input
            ref={inputRef}
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full truncate bg-transparent text-center text-xs text-zinc-500 outline-none"
          />
          {error && <p className="mt-1 text-center text-xs text-red-600">{error}</p>}
          <div className="mt-3 flex items-center gap-3 border-t border-zinc-200 pt-3">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">In the room</span>
            <span className="flex flex-1 flex-wrap justify-end gap-1">{people}</span>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Anyone with the link can join and edit. Share it only with your team.</p>
        </div>
      )}
    </div>
  );
}
