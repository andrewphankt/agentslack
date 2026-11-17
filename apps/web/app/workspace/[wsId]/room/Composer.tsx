"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { kindFromUrl } from "@/lib/embeds";
import { LOGO } from "./logos";

const iconBtn =
  "grid h-9 w-9 shrink-0 place-items-center rounded text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:opacity-60";

/**
 * The message bar: + picks a picture or video, the text, then your agent, GIF and Send.
 * Links typed or pasted into the text embed by themselves. Type @ to mention someone.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onFile,
  disabled,
  sending,
  placeholder,
  names,
  agent,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onFile: (file: File | null | undefined) => void;
  disabled: boolean;
  sending: boolean;
  placeholder: string;
  /** People who can be mentioned. */
  names: string[];
  /** Your own agent's name: adds a button that starts a message to it. */
  agent?: string | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const gifRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [pick, setPick] = useState(0);
  const [closed, setClosed] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [gif, setGif] = useState("");
  const [gifBad, setGifBad] = useState(false);

  // Grow with the text, up to about seven lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => {
    if (!gifOpen) return;
    const down = (e: MouseEvent) => {
      if (!gifRef.current?.contains(e.target as Node)) setGifOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGifOpen(false);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [gifOpen]);

  const query = useMemo(() => {
    const m = /(^|\s)@([^\s@]*)$/.exec(value.slice(0, caret));
    return m ? { text: m[2].toLowerCase(), at: caret - m[2].length - 1 } : null;
  }, [value, caret]);
  const matches = useMemo(
    () => (query && !closed ? names.filter((n) => n.toLowerCase().startsWith(query.text)).slice(0, 6) : []),
    [query, closed, names]
  );
  useEffect(() => setPick(0), [query?.text]);

  function mention(name: string) {
    if (!query) return;
    const next = `${value.slice(0, query.at)}@${name} ${value.slice(caret)}`;
    onChange(next);
    const pos = query.at + name.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  function addGif() {
    const v = gif.trim();
    if (!/^https?:\/\//i.test(v) || !(kindFromUrl(v) === "gif" || /tenor\.com|giphy\.com/i.test(v))) return setGifBad(true);
    onChange(value.trim() ? `${value.trimEnd()} ${v}` : v);
    setGif("");
    setGifBad(false);
    setGifOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
  }

  const can = !disabled && !sending && value.trim().length > 0;
  return (
    <div className="relative">
      {matches.length > 0 && (
        <ul role="listbox" aria-label="Mention" className="pop-in absolute bottom-full left-0 z-20 mb-1 w-56 rounded-md border border-zinc-900 bg-white p-1">
          {matches.map((n, i) => (
            <li key={n} role="option" aria-selected={i === pick}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  mention(n);
                }}
                className={`flex h-8 w-full items-center rounded px-2 text-left text-sm ${i === pick ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
              >
                @{n}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1 rounded-md border border-zinc-300 bg-white p-1.5 focus-within:border-zinc-900">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          aria-label="Add a picture or video"
          title="Add a picture or video (or paste or drop one)"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className={`${iconBtn} text-xl leading-none`}
        >
          <span aria-hidden className="-mt-0.5">
            +
          </span>
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled || sending}
          aria-label="Message"
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
            setClosed(false);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onPaste={(e) => {
            const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/") || x.type.startsWith("video/"));
            if (f) {
              e.preventDefault();
              onFile(f);
            }
          }}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setPick((p) => (p + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                mention(matches[pick]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setClosed(true);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          className="min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60"
        />
        {agent && (
          <button
            type="button"
            aria-label={`Mention ${agent}`}
            title={`Mention ${agent}, your agent`}
            disabled={disabled}
            onClick={() => {
              if (!value.includes(`@${agent}`)) onChange(`@${agent} ${value}`);
              requestAnimationFrame(() => ref.current?.focus());
            }}
            className={iconBtn}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="#D97757" aria-hidden>
              <path d={LOGO.claude} />
            </svg>
          </button>
        )}
        <div ref={gifRef} className="relative">
          <button
            type="button"
            aria-label="Add a GIF"
            aria-expanded={gifOpen}
            title="Add a GIF"
            disabled={disabled}
            onClick={() => setGifOpen((v) => !v)}
            className={`${iconBtn} w-11 text-[11px] font-bold tracking-wide ${gifOpen ? "bg-zinc-900 text-white hover:bg-zinc-900" : ""}`}
          >
            GIF
          </button>
          {gifOpen && (
            <div role="dialog" aria-label="Add a GIF" className="pop-in absolute bottom-full right-0 z-20 mb-2 w-72 rounded-md border border-zinc-900 bg-white p-2">
              <input
                autoFocus
                value={gif}
                placeholder="Paste a GIF link"
                aria-label="GIF link"
                aria-invalid={gifBad}
                onChange={(e) => {
                  setGif(e.target.value);
                  setGifBad(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGif();
                  }
                }}
                className="h-9 w-full rounded border border-zinc-300 px-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900"
              />
              {gifBad && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  That is not a GIF link
                </p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Send"
          title="Send"
          disabled={!can}
          onClick={onSend}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 ${
            can ? "bg-zinc-900 text-white hover:bg-zinc-700" : "bg-zinc-100 text-zinc-400"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
