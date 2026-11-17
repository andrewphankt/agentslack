"use client";

import { useEffect, useRef } from "react";

/** A small "are you sure" popup. Escape or a click outside cancels. */
export function Confirm({
  title,
  body,
  action,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  /** The word on the red button, for example "Delete". */
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const btn =
    "inline-flex h-9 items-center justify-center rounded px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1";
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-md border border-zinc-900 bg-white p-5 text-zinc-900"
        style={{ colorScheme: "light" }}
      >
        <h2 className="text-base font-bold">{title}</h2>
        {body && <p className="mt-1.5 text-sm text-zinc-600">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${btn} border border-zinc-300 bg-white hover:bg-zinc-50`}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}
