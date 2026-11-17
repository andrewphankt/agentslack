export type EmbedKind = "image" | "video" | "gif" | "youtube" | "github";

export const EMBED_LABELS: Record<EmbedKind, string> = {
  image: "Image",
  video: "Video",
  gif: "GIF",
  youtube: "YouTube",
  github: "GitHub",
};

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** "owner/repo" from a github.com URL (ignores deep paths), else null. */
export function githubRepo(url: string): string | null {
  const m = url.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (!m) return null;
  const repo = m[2].replace(/\.git$/, "");
  if (!repo) return null;
  return `${m[1]}/${repo}`;
}

/** Best-guess embed kind from a URL. */
export function kindFromUrl(url: string): EmbedKind | null {
  if (youtubeId(url)) return "youtube";
  if (githubRepo(url)) return "github";
  if (/\.gif(\?|#|$)/i.test(url)) return "gif";
  if (/\.(png|jpe?g|webp|avif|bmp)(\?|#|$)/i.test(url)) return "image";
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return "video";
  return null;
}
