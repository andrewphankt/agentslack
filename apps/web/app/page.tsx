import { cookies } from "next/headers";
import { Inter, JetBrains_Mono, Rajdhani } from "next/font/google";
import { prisma } from "@/lib/prisma";
import { hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/sessionIssue";
import { Avatar } from "./workspace/[wsId]/room/Avatar";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-rajdhani" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains" });
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-inter" });

async function signedInUserId(): Promise<string | null> {
  const raw = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const row = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(raw) },
    select: { userId: true, expiresAt: true },
  });
  return row && row.expiresAt > new Date() ? row.userId : null;
}

type RoomCard = {
  id: string;
  name: string;
  repo: string | null;
  agents: number;
  members: { name: string; avatarUrl: string | null }[];
  memberCount: number;
};

function repoName(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = url.replace(/\.git$/, "").replace(/\/+$/, "").split(/[/:]/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : parts[0];
}

async function loadRooms(userId: string): Promise<RoomCard[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
    select: { workspaceId: true },
  });
  const ids = memberships.map((m) => m.workspaceId);
  if (ids.length === 0) return [];
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      members: { orderBy: { joinedAt: "asc" }, take: 4, select: { userId: true, displayName: true } },
      projects: {
        where: { sourceType: "git" },
        orderBy: { id: "asc" },
        take: 1,
        select: { sourceUrl: true },
      },
      _count: { select: { agents: true, members: true } },
    },
  });
  const userIds = Array.from(new Set(workspaces.flatMap((w) => w.members.map((m) => m.userId))));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const byWs = new Map(workspaces.map((w) => [w.id, w]));
  const out: RoomCard[] = [];
  for (const id of ids) {
    const w = byWs.get(id);
    if (!w) continue;
    out.push({
      id: w.id,
      name: w.name,
      repo: repoName(w.projects[0]?.sourceUrl),
      agents: w._count.agents,
      memberCount: w._count.members,
      members: w.members.map((m) => {
        const u = byId.get(m.userId);
        return { name: m.displayName || u?.displayName || "Member", avatarUrl: u?.avatarUrl ?? null };
      }),
    });
  }
  return out;
}

const mono = "var(--font-family-mono)";
const display = "var(--font-family-display)";

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Tiny abstract room: dark channel strip on the left, white message area on the right. */
function RoomTile() {
  const bar = (w: string, c: string) => (
    <div style={{ height: 5, width: w, borderRadius: 3, background: c }} />
  );
  return (
    <div aria-hidden="true" style={{ position: "relative", aspectRatio: "16 / 9", background: "var(--color-canvas)", borderBottom: "1px solid var(--color-border)", padding: 10 }}>
      <div style={{ display: "flex", height: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border)", background: "#fff", boxShadow: "0 10px 30px -12px rgba(0,0,0,0.2)" }}>
        <div style={{ width: "26%", background: "#27272a", padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {bar("70%", "#71717a")}
          {bar("50%", "#52525b")}
          {bar("60%", "#52525b")}
        </div>
        <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 7 }}>
          {bar("80%", "#e4e4e7")}
          {bar("55%", "#e4e4e7")}
          {bar("68%", "#d4d4d8")}
          {bar("40%", "#e4e4e7")}
        </div>
      </div>
    </div>
  );
}

function CardBody({ name, sub, children }: { name: string; sub?: string | null; children: React.ReactNode }) {
  return (
    <div style={{ padding: "0.7rem 0.85rem 0.8rem" }}>
      <div style={{ fontFamily: display, fontSize: "1.02rem", fontWeight: 600, color: "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
        {name}
      </div>
      {sub && (
        <div style={{ fontFamily: mono, fontSize: "0.56rem", color: "var(--color-muted)", letterSpacing: "0.03em", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sub}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>{children}</div>
    </div>
  );
}

const meta: React.CSSProperties = { fontFamily: mono, fontSize: "0.56rem", color: "var(--color-muted)", letterSpacing: "0.03em" };

function Stack({ members, extra }: { members: { name: string; avatarUrl: string | null }[]; extra: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {members.map((m, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -6, display: "inline-flex", borderRadius: "50%", boxShadow: "0 0 0 2px var(--color-surface)" }}>
          <Avatar name={m.name} avatarUrl={m.avatarUrl} size={20} />
        </span>
      ))}
      {extra > 0 && <span style={{ ...meta, marginLeft: 5 }}>+{extra}</span>}
    </span>
  );
}

function RoomLink({ room }: { room: RoomCard }) {
  return (
    <a href={`/workspace/${room.id}/room`} className="l-card">
      <RoomTile />
      <CardBody name={room.name} sub={room.repo}>
        <Stack members={room.members} extra={Math.max(0, room.memberCount - room.members.length)} />
        <span style={meta}>
          {room.agents} {room.agents === 1 ? "agent" : "agents"}
        </span>
      </CardBody>
    </a>
  );
}

const EXAMPLES = [
  { name: "tea-shop", repo: "example/tea-shop", people: ["Maya", "Jon"], agents: 2 },
  { name: "study-buddy", repo: "example/study-buddy", people: ["Sam", "Priya", "Lee"], agents: 3 },
  { name: "weekend-game", repo: "example/weekend-game", people: ["Ana", "Tom"], agents: 1 },
];

function ExampleCard({ ex }: { ex: (typeof EXAMPLES)[number] }) {
  return (
    <div className="l-card" style={{ position: "relative" }}>
      <RoomTile />
      <span style={{ position: "absolute", top: 18, right: 18, padding: "0.14rem 0.5rem", borderRadius: 999, background: "rgba(244,241,236,0.92)", boxShadow: "0 1px 5px rgba(0,0,0,0.10)", fontFamily: mono, fontSize: "0.5rem", letterSpacing: "0.04em", color: "var(--color-green)" }}>
        Example
      </span>
      <CardBody name={ex.name} sub={ex.repo}>
        <Stack members={ex.people.map((p) => ({ name: p, avatarUrl: null }))} extra={0} />
        <span style={meta}>
          {ex.agents} {ex.agents === 1 ? "agent" : "agents"}
        </span>
      </CardBody>
    </div>
  );
}

export default async function HomePage() {
  const userId = await signedInUserId();
  const [user, rooms] = userId
    ? await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true, avatarUrl: true } }),
        loadRooms(userId),
      ])
    : [null, [] as RoomCard[]];
  const userName = user?.displayName || user?.email || "You";

  return (
    <div
      className={`landing ${rajdhani.variable} ${jetbrains.variable} ${inter.variable}`}
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        ["--font-family-display" as string]: "var(--font-rajdhani), sans-serif",
        ["--font-family-mono" as string]: "var(--font-jetbrains), 'Courier New', monospace",
      }}
    >
      <header
        style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, height: 44, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 1.8rem", background: "var(--color-nav)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--color-border)" }}
      >
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: "0.95rem", color: "var(--color-ink)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          AgentSlack
        </span>
        {userId && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar name={userName} avatarUrl={user?.avatarUrl} size={24} />
            <span style={{ fontFamily: mono, fontSize: "0.62rem", color: "var(--color-ink)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {userName}
            </span>
            <SignOutButton />
          </div>
        )}
      </header>

      <main className="canvas-dotgrid l-split" style={{ display: "flex", minHeight: "100vh", paddingTop: 44, boxSizing: "border-box" }}>
        <section className="l-hero" style={{ flex: "0 0 auto", width: 500, display: "flex", flexDirection: "column", padding: "2.75rem 3rem" }}>
          <div className="animate-in">
            <h1 style={{ fontFamily: display, fontSize: "2.4rem", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em", margin: "0 0 1.1rem", color: "var(--color-ink)" }}>
              Build one project together without stepping on each other.
            </h1>
            <p style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", fontSize: "0.92rem", color: "var(--color-muted)", lineHeight: 1.5, maxWidth: 400, margin: "0 0 1.9rem" }}>
              Connect a repo, bring your own agent and keep working in your terminal. Saving, staying up to date and not overwriting each other are handled for you.
            </p>
            {userId ? (
              <a href="/start" className="l-cta">
                New room
              </a>
            ) : (
              <>
                <a href={`/api/auth/github/signin/start?return_to=${encodeURIComponent("/start")}`} className="l-cta">
                  <GitHubMark /> Continue with GitHub
                </a>
                <p style={{ fontFamily: mono, fontSize: "0.56rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-muted)", marginTop: "0.9rem" }}>
                  Free while in testing
                </p>
              </>
            )}
            {process.env.NODE_ENV !== "production" && (
              <div style={{ marginTop: "2.4rem", display: "inline-flex", flexDirection: "column", gap: 8, border: "1px dashed var(--color-border2)", borderRadius: 10, padding: "0.8rem 1rem" }}>
                <span style={{ fontFamily: mono, fontSize: "0.56rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)" }}>
                  Testing mode
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {["alice", "bob"].map((p) => (
                    <a key={p} href={`/api/auth/demo?user=${p}`} className="l-demo">
                      Demo: {p}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="l-panel" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--color-border)", background: "transparent" }}>
          <div className="l-panel-in" style={{ padding: "2.75rem 2.6rem 4rem" }}>
            <h2 style={{ fontFamily: display, fontSize: "1.6rem", fontWeight: 700, color: "var(--color-ink)", margin: "0 0 0.25rem" }}>
              {userId ? "Your rooms" : "Rooms"}
            </h2>
            <p style={{ fontFamily: mono, fontSize: "0.62rem", color: "var(--color-muted)", letterSpacing: "0.04em", margin: "0 0 1.6rem" }}>
              {userId ? "Each room is one project." : "A room is one project and everyone building it."}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 18 }}>
              {userId ? (
                <>
                  {rooms.map((r) => (
                    <RoomLink key={r.id} room={r} />
                  ))}
                  <a href="/start" className="l-card" style={{ background: "transparent", border: "1px dashed var(--color-border2)", alignItems: "center", justifyContent: "center", minHeight: 140, gap: 6 }}>
                    <span aria-hidden="true" style={{ fontSize: "1.4rem", color: "var(--color-muted)", lineHeight: 1 }}>+</span>
                    <span style={{ fontFamily: display, fontSize: "1.02rem", fontWeight: 600, color: "var(--color-ink)" }}>New room</span>
                  </a>
                </>
              ) : (
                EXAMPLES.map((ex) => <ExampleCard key={ex.name} ex={ex} />)
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
