import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { hashSessionToken, parseCookieHeader, SESSION_COOKIE_NAME } from "@/lib/sessionIssue";
import { githubRepo } from "@/lib/embeds";

export const dynamic = "force-dynamic";

const MAX_BYTES = 300_000; // metadata lives in <head>; stop reading after this
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

export type Unfurl = {
  title: string | null;
  image: string | null;
  site: string;
  description?: string | null;
  stars?: number | null;
};

const cache = new Map<string, { at: number; value: Unfurl | null }>();

function blockedIp(ip: string): boolean {
  if (ip.includes(":")) {
    const h = ip.toLowerCase();
    if (h === "::" || h === "::1") return true;
    if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    const v4 = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return v4 ? blockedIp(v4[1]) : false;
  }
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return true;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/** Refuse non-http(s), local names, and any host that resolves to a private address. */
async function isSafe(u: URL): Promise<boolean> {
  if (!/^https?:$/.test(u.protocol)) return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (isIP(host)) return !blockedIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !blockedIp(a.address));
  } catch {
    return false;
  }
}

const pick = (html: string, ...res: RegExp[]): string | null => {
  for (const re of res) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
};
const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/gi, "'");

/** Fetch with a timeout, following redirects by hand so every hop is re-checked. */
async function safeFetch(start: URL, accept: string): Promise<{ res: Response; url: URL } | null> {
  let url = start;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (!(await isSafe(url))) return null;
      const res = await fetch(url.href, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; AgentSlackUnfurl/1.0)", accept },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return null;
        try {
          url = new URL(loc, url);
        } catch {
          return null;
        }
        continue;
      }
      return { res, url };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function unfurlGithub(repo: string): Promise<Unfurl | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "AgentSlackUnfurl/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      full_name?: string;
      description?: string | null;
      stargazers_count?: number;
      owner?: { avatar_url?: string };
    };
    return {
      title: j.full_name ?? repo,
      description: j.description ? String(j.description).slice(0, 300) : null,
      stars: typeof j.stargazers_count === "number" ? j.stargazers_count : null,
      image: null,
      site: "github.com",
    };
  } catch {
    return null;
  }
}

async function unfurlPage(parsed: URL): Promise<Unfurl | null> {
  const got = await safeFetch(parsed, "text/html");
  if (!got || !got.res.ok || !(got.res.headers.get("content-type") || "").includes("text/html")) return null;
  const reader = got.res.body?.getReader();
  let html = "";
  let bytes = 0;
  if (reader) {
    const dec = new TextDecoder();
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    reader.cancel().catch(() => {});
  }
  const title = pick(
    html,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([^<]+)<\/title>/i
  );
  let image = pick(
    html,
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );
  if (image) {
    try {
      image = new URL(decodeEntities(image), got.url).href;
    } catch {
      image = null;
    }
  }
  return {
    title: title ? decodeEntities(title).slice(0, 200) : null,
    image: image && /^https?:\/\//i.test(image) ? image : null,
    site: got.url.hostname.replace(/^www\./, ""),
  };
}

export async function GET(req: Request) {
  const raw = parseCookieHeader(req.headers.get("cookie"), SESSION_COOKIE_NAME);
  const session = raw
    ? await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(raw) },
        select: { expiresAt: true },
      })
    : null;
  if (!session || session.expiresAt <= new Date()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const target = new URL(req.url).searchParams.get("url") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Bad url" }, { status: 400 });
  }
  if (!(await isSafe(parsed))) return NextResponse.json({ error: "Blocked" }, { status: 400 });

  const key = parsed.href;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.value ?? { title: null, image: null });

  const repo = githubRepo(parsed.href);
  const value = repo ? await unfurlGithub(repo) : await unfurlPage(parsed);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), value });
  return NextResponse.json(value ?? { title: null, image: null });
}
