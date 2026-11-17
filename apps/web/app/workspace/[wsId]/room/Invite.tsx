"use client";

import { useEffect, useRef, useState } from "react";

/** Primary Invite button with a small popover holding the join link. */
export function Invite({ inviteCode }: { inviteCode: string }) {
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
        className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
      >
        Invite
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Invite people"
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-zinc-900 shadow-lg"
        >
          <p className="mb-2 text-sm text-zinc-600">Anyone with this link can join and edit the project. Share it only with your team.</p>
          <input
            ref={inputRef}
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="mb-2 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
          <button
            type="button"
            autoFocus
            disabled={!link}
            onClick={() => void copy()}
            className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
