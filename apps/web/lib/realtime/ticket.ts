import { createHmac } from "node:crypto";

/** Short-lived signed ticket so browsers never see a member's contextToken. */
export function issueRealtimeTicket(wsId: string, userId: string): string {
  const secret = process.env.REALTIME_INTERNAL_SECRET ?? "dev-secret-change-me";
  const body = Buffer.from(
    JSON.stringify({ w: wsId, u: userId, exp: Date.now() + 60_000 })
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${sig}`;
}
