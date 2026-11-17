import { prisma } from "@/lib/prisma";

export type ChannelRow = {
  id: string;
  kind: string;
  name: string;
  memberIds: string[];
};

export async function ensureGeneral(wsId: string) {
  return prisma.channel.upsert({
    where: {
      workspaceId_kind_name: { workspaceId: wsId, kind: "channel", name: "general" },
    },
    update: {},
    create: { workspaceId: wsId, kind: "channel", name: "general" },
  });
}

export function canSee(channel: ChannelRow, userId: string): boolean {
  return channel.kind === "dm" ? channel.memberIds.includes(userId) : true;
}

export async function displayNames(wsId: string): Promise<Map<string, string>> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: wsId },
    select: { userId: true, displayName: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: members.map((m) => m.userId) } },
    select: { id: true, displayName: true },
  });
  const userName = new Map(users.map((u) => [u.id, u.displayName]));
  return new Map(
    members.map((m) => [
      m.userId,
      // A member name equal to the raw id is a placeholder: use the person's real name.
      (m.displayName && m.displayName !== m.userId ? m.displayName : null) ??
        userName.get(m.userId) ??
        m.userId,
    ])
  );
}

export function errStatus(e: unknown): number {
  return (e as { status?: number }).status ?? 500;
}

/** A picture someone uploaded is stored on their account; everyone loads it from one short link. */
export function pictureLink(userId: string, stored: string | null): string | null {
  if (!stored || !stored.startsWith("data:")) return stored;
  return `/api/avatar/${encodeURIComponent(userId)}?v=${stored.length}-${stored.slice(-8).replace(/[^A-Za-z0-9]/g, "")}`;
}

export async function avatarUrls(userIds: string[]): Promise<Map<string, string | null>> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, avatarUrl: true },
  });
  return new Map(users.map((u) => [u.id, pictureLink(u.id, u.avatarUrl)]));
}
