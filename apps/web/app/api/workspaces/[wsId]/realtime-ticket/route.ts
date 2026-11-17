import { NextResponse } from "next/server";
import { actorUserIdFromWorkspaceAuth } from "@/lib/auth";
import { issueRealtimeTicket } from "@/lib/realtime/ticket";
import { errStatus } from "@/lib/chat";

export async function GET(req: Request, ctx: { params: { wsId: string } }) {
  const { wsId } = ctx.params;
  try {
    const userId = await actorUserIdFromWorkspaceAuth(wsId, req);
    return NextResponse.json({
      ticket: issueRealtimeTicket(wsId, userId),
      wsHost: process.env.NEXT_PUBLIC_WS_HOST ?? "ws://localhost:4001",
    });
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: errStatus(e) });
  }
}
