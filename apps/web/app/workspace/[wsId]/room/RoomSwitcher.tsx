"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Room = { workspaceId: string; name: string };

/** Room name + icon as one button; opens a list to switch rooms or make a new one. */
export function RoomSwitcher({
  wsId,
  name,
  headers,
}: {
  wsId: string;
  name: string;
  headers: HeadersInit;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const r = await fetch("/api/workspaces", { headers });
      if (r.ok && alive) setRooms((await r.json()) as Room[]);
    })();
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const title = name || "Room";
  const tile = (label: string) => (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-zinc-700 text-xs font-semibold uppercase text-zinc-100">
      {label.trim().charAt(0) || "?"}
    </span>
  );

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-left hover:border-zinc-700"
      >
        {tile(title)}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        <span aria-hidden className={`text-xs text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl"
        >
          <div className="max-h-64 overflow-y-auto">
            {rooms.map((r) => (
              <Link
                key={r.workspaceId}
                role="menuitem"
                href={`/workspace/${r.workspaceId}/room`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                {tile(r.name)}
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.workspaceId === wsId && <span className="text-xs text-zinc-400">✓</span>}
              </Link>
            ))}
          </div>

          <div className="my-1 border-t border-zinc-800" />

          <button
            type="button"
            role="menuitem"
            onClick={() => router.push("/start")}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <span className="grid h-7 w-7 place-items-center rounded-md border border-dashed border-zinc-600 text-zinc-400">
              +
            </span>
            New room
          </button>
          <Link
            role="menuitem"
            href={`/workspace/${wsId}`}
            className="block rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            Room settings
          </Link>
        </div>
      )}
    </div>
  );
}
