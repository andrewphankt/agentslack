"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Put saved ids first (in saved order); anything unknown goes at the end in its own order. */
export function applyOrder<T extends { id: string }>(items: T[], saved: string[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: T[] = [];
  for (const id of saved) {
    const it = byId.get(id);
    if (it) {
      out.push(it);
      byId.delete(id);
    }
  }
  for (const it of items) if (byId.has(it.id)) out.push(it);
  return out;
}

/** Order saved in localStorage under `key` (null key = not saved). Storage errors are ignored. */
export function useSavedOrder(key: string | null): [string[], (ids: string[]) => void] {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    if (!key) return setSaved([]);
    try {
      const raw = localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setSaved(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
    } catch {
      setSaved([]);
    }
  }, [key]);
  const save = useCallback(
    (ids: string[]) => {
      setSaved(ids);
      if (!key) return;
      try {
        localStorage.setItem(key, JSON.stringify(ids));
      } catch {
        /* storage blocked: the order still holds for this visit */
      }
    },
    [key]
  );
  return [saved, save];
}

type DragState = {
  id: string;
  startX: number;
  startY: number;
  grabDx: number;
  grabDy: number;
  width: number;
  started: boolean;
};

/**
 * Pointer-drag sortable list. The grabbed row lifts as an overlay that follows the
 * cursor, the other rows slide into place (FLIP), and a click without a drag still
 * reaches the row's own button. Alt+ArrowUp / Alt+ArrowDown moves the focused row.
 * Mouse and pen drag; touch keeps scrolling the sidebar.
 */
export function SortableRows<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  label,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T) => ReactNode;
  label: string;
}) {
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ x: number; y: number; w: number } | null>(null);

  const byId = new Map(items.map((i) => [i.id, i]));
  const shown = dragIds ? dragIds.filter((id) => byId.has(id)) : items.map((i) => i.id);
  const shownKey = shown.join("|");

  const elsRef = useRef(new Map<string, HTMLDivElement>());
  const flipPrev = useRef<Map<string, DOMRect> | null>(null);
  const drag = useRef<DragState | null>(null);
  const idsRef = useRef<string[]>(shown);
  idsRef.current = shown;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const focusId = useRef<string | null>(null);
  const justDragged = useRef(false);
  const stopListening = useRef<(() => void) | null>(null);

  useEffect(() => () => stopListening.current?.(), []);

  useLayoutEffect(() => {
    const prev = flipPrev.current;
    flipPrev.current = null;
    if (prev) {
      elsRef.current.forEach((el, id) => {
        if (id === drag.current?.id && drag.current.started) return;
        const before = prev.get(id);
        if (!before) return;
        const dy = before.top - el.getBoundingClientRect().top;
        if (dy && typeof el.animate === "function") {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
            duration: 170,
            easing: "cubic-bezier(0.2,0,0,1)",
          });
        }
      });
    }
    if (focusId.current) {
      elsRef.current.get(focusId.current)?.querySelector("button")?.focus();
      focusId.current = null;
    }
  }, [shownKey]);

  const captureRects = () => {
    const m = new Map<string, DOMRect>();
    elsRef.current.forEach((el, id) => m.set(id, el.getBoundingClientRect()));
    return m;
  };

  function reorderTo(clientY: number) {
    const ids = idsRef.current;
    const id = drag.current!.id;
    let index = 0;
    for (const oid of ids) {
      if (oid === id) continue;
      const el = elsRef.current.get(oid);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) index++;
      else break;
    }
    const without = ids.filter((x) => x !== id);
    const next = [...without.slice(0, index), id, ...without.slice(index)];
    if (next.join("|") !== ids.join("|")) {
      flipPrev.current = captureRects();
      setDragIds(next);
    }
  }

  function onDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const el = elsRef.current.get(id);
    if (!el) return;
    stopListening.current?.();
    const r = el.getBoundingClientRect();
    drag.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      grabDx: e.clientX - r.left,
      grabDy: e.clientY - r.top,
      width: r.width,
      started: false,
    };

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.started) {
        if (Math.abs(ev.clientX - d.startX) + Math.abs(ev.clientY - d.startY) < 5) return;
        d.started = true;
        setDragId(d.id);
        setDragIds(idsRef.current);
      }
      setOverlay({ x: ev.clientX - d.grabDx, y: ev.clientY - d.grabDy, w: d.width });
      reorderTo(ev.clientY);
    };
    const end = (commit: boolean) => {
      stopListening.current?.();
      const d = drag.current;
      drag.current = null;
      if (d?.started) {
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
        if (commit) onReorderRef.current(idsRef.current);
      }
      setDragId(null);
      setDragIds(null);
      setOverlay(null);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", esc);
    stopListening.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", esc);
      stopListening.current = null;
    };
  }

  function onKey(e: React.KeyboardEvent, id: string) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const ids = idsRef.current;
    const from = ids.indexOf(id);
    const to = from + (e.key === "ArrowUp" ? -1 : 1);
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = ids.slice();
    next.splice(from, 1);
    next.splice(to, 0, id);
    flipPrev.current = captureRects();
    focusId.current = id;
    onReorder(next);
  }

  const dragged = dragId ? byId.get(dragId) : undefined;

  return (
    <div role="group" aria-label={label}>
      {shown.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) elsRef.current.set(id, el);
              else elsRef.current.delete(id);
            }}
            onPointerDown={(e) => onDown(e, id)}
            onKeyDown={(e) => onKey(e, id)}
            onClickCapture={(e) => {
              if (justDragged.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            style={{ visibility: id === dragId ? "hidden" : "visible", userSelect: "none" }}
          >
            {renderItem(item)}
          </div>
        );
      })}
      {dragged &&
        overlay &&
        createPortal(
          <div
            aria-hidden
            className="rounded bg-zinc-800 text-zinc-100 shadow-xl ring-1 ring-zinc-700"
            style={{
              position: "fixed",
              left: overlay.x,
              top: overlay.y,
              width: overlay.w,
              transform: "scale(1.03)",
              transformOrigin: "left center",
              pointerEvents: "none",
              zIndex: 9999,
              userSelect: "none",
            }}
          >
            {renderItem(dragged)}
          </div>,
          document.body
        )}
    </div>
  );
}
