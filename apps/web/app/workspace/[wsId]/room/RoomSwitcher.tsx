"use client";

import { MeshMark } from "@/components/MeshPage";
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
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-zinc-900 hover:bg-zinc-100 focus-visible:outline-none focus-visible:bg-zinc-100";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mesh, ${title}. Switch rooms`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-zinc-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
      >
        <MeshMark size={22} dots={34} />
        <span className="sr-only">Mesh</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full z-20 mt-1 rounded border border-zinc-300 bg-white p-1 shadow-sm">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Rooms</p>
          <div className="max-h-64 overflow-y-auto">
            {rooms.map((r) => (
              <Link
                key={r.workspaceId}
                role="menuitem"
                href={`/workspace/${r.workspaceId}/room`}
                onClick={() => setOpen(false)}
                aria-current={r.workspaceId === wsId ? "true" : undefined}
                className={`${item} ${r.workspaceId === wsId ? "font-semibold" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {r.workspaceId === wsId && (
                  <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </Link>
            ))}
          </div>

          <div className="my-1 border-t border-zinc-200" />

          <button type="button" role="menuitem" onClick={() => router.push("/start")} className={item}>
            New Room
          </button>
          <button type="button" role="menuitem" onClick={() => router.push("/start")} className={item}>
            Join a Room
          </button>
          <Link role="menuitem" href={`/workspace/${wsId}`} className={`${item} text-zinc-600`}>
            Room Settings
          </Link>
        </div>
      )}
    </div>
  );
}
