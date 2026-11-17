/** A link someone gave the room: undefined = not sent, null = cleared. Throws a plain-words reason. */
export function cleanUrl(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error("Link must be text");
  const s = v.trim();
  if (!s) return null;
  if (s.length > 300) throw new Error("Link is too long");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error("That does not look like a link");
  }
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !local) throw new Error("The link must start with https://");
  return s;
}
