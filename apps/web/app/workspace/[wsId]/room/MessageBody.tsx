"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { githubRepo, kindFromUrl, youtubeId } from "@/lib/embeds";

type Unfurl = {
  title: string | null;
  image: string | null;
  site?: string;
  description?: string | null;
  stars?: number | null;
};

// One fetch per URL for the whole session, so scrolling and re-renders never refetch.
const unfurlCache = new Map<string, Promise<Unfurl | null>>();
function loadUnfurl(url: string): Promise<Unfurl | null> {
  let p = unfurlCache.get(url);
  if (!p) {
    p = fetch(`/api/unfurl?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Unfurl>) : null))
      .catch(() => null);
    unfurlCache.set(url, p);
  }
  return p;
}

const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Split text into plain strings and URLs, trimming trailing punctuation off each URL. */
function parts(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const at = m.index ?? 0;
    // Drop sentence punctuation, and a closing bracket only when it has no opener in the URL.
    for (;;) {
      const c = url[url.length - 1];
      if (/[.,;:!?'"]/.test(c)) url = url.slice(0, -1);
      else if (c === ")" && !url.includes("(")) url = url.slice(0, -1);
      else if (c === "]" && !url.includes("[")) url = url.slice(0, -1);
      else break;
    }
    try {
      new URL(url);
    } catch {
      continue;
    }
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: url, url });
    last = at + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const frame = "mt-1 max-w-full overflow-hidden rounded-lg border border-zinc-200 sm:max-w-md";

function Card({ url, onLoaded, repo }: { url: string; onLoaded: () => void; repo: string | null }) {
  const [data, setData] = useState<Unfurl | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadUnfurl(url).then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [url]);
  useEffect(() => {
    if (data !== undefined) onLoaded();
    // onLoaded changes identity each render; one call per result is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data || !data.title) return null;
  const site = data.site ?? new URL(url).hostname.replace(/^www\./, "");
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={`${frame} flex items-stretch bg-zinc-50 text-zinc-900 no-underline hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
    >
      {!repo && data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={onLoaded}
          className="h-auto w-24 shrink-0 object-cover"
        />
      )}
      <span className="min-w-0 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          {repo && (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.32c-2.23.49-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          )}
          <span className="truncate">{site}</span>
        </span>
        <span className="block truncate text-sm font-semibold">{data.title}</span>
        {repo && data.description && (
          <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-600">{data.description}</span>
        )}
        {repo && typeof data.stars === "number" && (
          <span className="mt-1 block text-xs text-zinc-500">
            {data.stars.toLocaleString("en-US")} stars
          </span>
        )}
      </span>
    </a>
  );
}

function Embed({ url, onLoaded }: { url: string; onLoaded: () => void }) {
  const kind = kindFromUrl(url);
  if (kind === "youtube") {
    const id = youtubeId(url)!;
    return (
      <div className={`${frame} aspect-video w-full bg-black`}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title="YouTube video"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={onLoaded}
          className="h-full w-full border-0"
        />
      </div>
    );
  }
  if (kind === "image" || kind === "gif") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={onLoaded}
        className="mt-1 max-h-80 max-w-full rounded-lg border border-zinc-200 sm:max-w-md"
      />
    );
  }
  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        playsInline
        onLoadedMetadata={onLoaded}
        className="mt-1 max-h-80 max-w-full rounded-lg border border-zinc-200 sm:max-w-md"
      />
    );
  }
  return <Card url={url} onLoaded={onLoaded} repo={kind === "github" ? githubRepo(url) : null} />;
}

/** A chat message: linked text, up to 3 link embeds, and an uploaded picture or video. */
export function MessageBody({
  text,
  imageUrl,
  imageKind,
  alt,
  onLoaded,
}: {
  text: string;
  imageUrl?: string | null;
  imageKind?: string;
  alt: string;
  onLoaded: () => void;
}) {
  const pieces = useMemo(() => parts(text), [text]);
  const embedUrls = useMemo(
    () => Array.from(new Set(pieces.flatMap((p) => (p.url ? [p.url] : [])))).slice(0, 3),
    [pieces]
  );
  return (
    <>
      {text && (
        <div className="max-w-[72ch] whitespace-pre-wrap break-words text-sm text-zinc-800">
          {pieces.map((p, i) =>
            p.url ? (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {p.text}
              </a>
            ) : (
              <Fragment key={i}>{p.text}</Fragment>
            )
          )}
        </div>
      )}
      {embedUrls.map((u) => (
        <div key={u}>
          <Embed url={u} onLoaded={onLoaded} />
        </div>
      ))}
      {imageUrl && imageKind === "video" && (
        <video
          src={imageUrl}
          controls
          preload="metadata"
          playsInline
          onLoadedMetadata={onLoaded}
          className="mt-1 max-h-80 max-w-full rounded-lg border border-zinc-200 sm:max-w-md"
        />
      )}
      {imageUrl && imageKind !== "video" && (
        <a href={imageUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={alt}
            onLoad={onLoaded}
            className="max-h-80 max-w-full rounded-lg border border-zinc-200 sm:max-w-md"
          />
        </a>
      )}
    </>
  );
}
