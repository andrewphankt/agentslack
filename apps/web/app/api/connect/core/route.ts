import { ROOM_CORE } from "@/lib/roomCore";

export const dynamic = "force-dynamic";

/** The room's current script. Connected projects fetch this at the start of each turn. */
export async function GET() {
  return new Response(ROOM_CORE, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
