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
      m.displayName ?? userName.get(m.userId) ?? m.userId,
    ])
  );
}

export function errStatus(e: unknown): number {
  return (e as { status?: number }).status ?? 500;
}

export async function avatarUrls(userIds: string[]): Promise<Map<string, string | null>> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, avatarUrl: true },
  });
  return new Map(users.map((u) => [u.id, u.avatarUrl]));
}
