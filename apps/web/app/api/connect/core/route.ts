import { createVerify } from "node:crypto";
import { ROOM_CORE } from "@/lib/roomCore";
import { ROOM_CORE_SIG, ROOM_PUBLIC_KEY } from "@/lib/roomCoreSig";

export const dynamic = "force-dynamic";

// If the script was changed without signing it again, connected projects would quietly keep
// their old copy. Say so loudly in the server log instead.
if (!createVerify("RSA-SHA256").update(ROOM_CORE).verify(ROOM_PUBLIC_KEY, ROOM_CORE_SIG, "base64"))
  console.error("[mesh] lib/roomCore.ts changed but was not signed again. Run: node scripts/sign-room-core.mjs");

/** The room's current script (or, with ?sig=1, its signature). Fetched at the start of each turn. */
export async function GET(req: Request) {
  const sig = new URL(req.url).searchParams.get("sig");
  return new Response(sig ? ROOM_CORE_SIG : ROOM_CORE, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
