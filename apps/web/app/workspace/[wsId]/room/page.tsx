"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useJsonHeaders } from "@/hooks/useActorUserId";
import { ConnectAgent } from "./ConnectAgent";
import { RoomSwitcher } from "./RoomSwitcher";

type Channel = { id: string; kind: string; name: string; title: string };
type Member = { userId: string; name: string; role: string };
type Msg = {
  id: string;
  authorUserId: string | null;
  authorName: string;
  text: string;
  isAgent?: boolean;
  createdAt: string;
};
type AgentRow = {
  id: string;
  kind: string;
  label: string;
  mine: boolean;
  online: boolean;
};

const INITIALS: Record<string, string> = { claude: "CL", codex: "CX", gemini: "GM" };

function hhmm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function mergeMsgs(prev: Msg[], add: Msg[]): Msg[] {
  const seen = new Set(prev.map((m) => m.id));
  const fresh = add.filter((m) => !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

export default function RoomPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const headers = useJsonHeaders();

  const [wsName, setWsName] = useState("");
  const [me, setMe] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [current, setCurrent] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const currentRef = useRef<Channel | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  const headersRef = useRef(headers);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  currentRef.current = current;
  messagesRef.current = messages;
  headersRef.current = headers;

  const api = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(`/api/workspaces/${wsId}${path}`, {
        ...init,
        headers: { ...headersRef.current, ...(init?.headers ?? {}) },
      }),
    [wsId]
  );

  const loadChannels = useCallback(async () => {
    const res = await api("/channels");
    if (!res.ok) {
      setErr(`Could not load channels (${res.status})`);
      return null;
    }
    const data = (await res.json()) as {
      me: string;
      members: Member[];
      channels: Channel[];
    };
    setMe(data.me);
    setMembers(data.members);
    setChannels(data.channels);
    return data.channels;
  }, [api]);

  const loadAgents = useCallback(async () => {
    const res = await api("/agents");
    if (res.ok) setAgents(((await res.json()) as { agents: AgentRow[] }).agents);
  }, [api]);

  async function removeAgent(id: string) {
    if (confirmId !== id) return setConfirmId(id);
    setConfirmId(null);
    await api(`/agents/${id}`, { method: "DELETE" });
    void loadAgents();
  }

  const openChannel = useCallback((c: Channel) => {
    stickRef.current = true;
    setCurrent(c);
    setMessages([]);
    setSidebarOpen(false);
    setUnread((u) => {
      if (!u.has(c.id)) return u;
      const n = new Set(u);
      n.delete(c.id);
      return n;
    });
  }, []);

  // Mount: workspace name + channels, select #general.
  useEffect(() => {
    void (async () => {
      const w = await api("");
      if (w.ok) setWsName(((await w.json()) as { name: string }).name);
      const list = await loadChannels();
      if (list) {
        const g = list.find((c) => c.kind === "channel" && c.name === "general") ?? list[0];
        if (g) openChannel(g);
      }
    })();
  }, [api, loadChannels, openChannel]);

  // Agents: on mount and every 30s (online dots); realtime refreshes below.
  useEffect(() => {
    void loadAgents();
    const t = setInterval(() => void loadAgents(), 30_000);
    return () => clearInterval(t);
  }, [loadAgents]);

  // Load messages when channel changes.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    void (async () => {
      const res = await api(`/channels/${current.id}/messages`);
      if (cancelled) return;
      if (!res.ok) return setErr(`Could not load messages (${res.status})`);
      setErr(null);
      setMessages(((await res.json()) as { messages: Msg[] }).messages);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, current]);

  const fetchNew = useCallback(async () => {
    const c = currentRef.current;
    if (!c) return;
    const last = messagesRef.current[messagesRef.current.length - 1];
    const q = last ? `?after=${encodeURIComponent(last.createdAt)}` : "";
    const res = await api(`/channels/${c.id}/messages${q}`);
    if (!res.ok || currentRef.current?.id !== c.id) return;
    const add = ((await res.json()) as { messages: Msg[] }).messages;
    if (add.length) setMessages((p) => mergeMsgs(p, add));
  }, [api]);

  // Realtime socket with ticket auth; reconnect after 2s.
  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function connect() {
      if (closed) return;
      try {
        const res = await api("/realtime-ticket");
        if (!res.ok) throw new Error("ticket");
        const { ticket, wsHost } = (await res.json()) as {
          ticket: string;
          wsHost: string;
        };
        if (closed) return;
        ws = new WebSocket(
          `${wsHost}/ws?workspaceId=${wsId}&ticket=${encodeURIComponent(ticket)}`
        );
        ws.onopen = () => setLive(true);
        ws.onmessage = (e) => {
          let ev: { type?: string; channelId?: string };
          try {
            ev = JSON.parse(String(e.data));
          } catch {
            return;
          }
          if (ev.type === "chat_message" && ev.channelId) {
            if (ev.channelId === currentRef.current?.id) void fetchNew();
            else
              setUnread((u) => {
                const n = new Set(u);
                n.add(ev.channelId!);
                return n;
              });
          } else if (ev.type === "chat_channels_changed") {
            void loadChannels();
          } else if (ev.type === "agents_changed") {
            void loadAgents();
          }
        };
        ws.onclose = () => {
          setLive(false);
          if (!closed) timer = setTimeout(connect, 2000);
        };
        ws.onerror = () => ws?.close();
      } catch {
        setLive(false);
        if (!closed) timer = setTimeout(connect, 2000);
      }
    }
    void connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, [api, wsId, fetchNew, loadChannels, loadAgents]);

  // Polling fallback when the socket is down.
  useEffect(() => {
    if (live || !current) return;
    const t = setInterval(() => void fetchNew(), 5000);
    return () => clearInterval(t);
  }, [live, current, fetchNew]);

  // Auto-scroll.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, current]);

  async function createChannel() {
    const name = newName.trim();
    if (!name) return;
    const res = await api("/channels", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) return setErr("Could not create channel");
    const { channel } = (await res.json()) as { channel: Channel };
    setNewName("");
    setShowNew(false);
    await loadChannels();
    openChannel(channel);
  }

  async function openDm(userId: string) {
    const res = await api("/channels", { method: "POST", body: JSON.stringify({ userId }) });
    if (!res.ok) return setErr("Could not open conversation");
    const { channel } = (await res.json()) as { channel: Channel };
    await loadChannels();
    openChannel(channel);
  }

  async function send() {
    const body = text.trim();
    if (!body || !current || sending) return;
    setSending(true);
    try {
      const res = await api(`/channels/${current.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: body }),
      });
      if (!res.ok) return setErr("Message failed to send");
      const { message } = (await res.json()) as { message: Msg };
      setErr(null);
      setText("");
      stickRef.current = true;
      setMessages((p) => mergeMsgs(p, [message]));
    } finally {
      setSending(false);
    }
  }

  const grouped = useMemo(
    () =>
      messages.map((m, i) => {
        const prev = messages[i - 1];
        const collapse =
          !!prev &&
          prev.authorUserId === m.authorUserId &&
          prev.authorName === m.authorName &&
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
        return { m, collapse };
      }),
    [messages]
  );

  const dmByUser = useMemo(() => {
    const map = new Map<string, Channel>();
    for (const c of channels) if (c.kind === "dm") map.set(c.title, c);
    return map;
  }, [channels]);

  const row = (active: boolean) =>
    `flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
      active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900"
    }`;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[45px] flex bg-zinc-950 text-zinc-100">
      <aside
        className={`${sidebarOpen ? "flex" : "hidden"} w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-800 bg-zinc-950 p-3 md:flex`}
      >
        <RoomSwitcher wsId={wsId} name={wsName} headers={headers} />

        <div>
          <div className="mb-1 flex items-center justify-between px-2 text-xs uppercase tracking-wide text-zinc-500">
            <span>Channels</span>
            <button
              type="button"
              className="rounded px-1 text-base leading-none text-zinc-400 hover:bg-zinc-800"
              onClick={() => setShowNew((v) => !v)}
              aria-label="New channel"
            >
              +
            </button>
          </div>
          {showNew && (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createChannel();
                if (e.key === "Escape") setShowNew(false);
              }}
              placeholder="channel-name"
              className="mb-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm outline-none focus:border-violet-500"
            />
          )}
          {channels
            .filter((c) => c.kind === "channel")
            .map((c) => (
              <button
                key={c.id}
                type="button"
                className={row(current?.id === c.id)}
                onClick={() => openChannel(c)}
              >
                <span className="truncate"># {c.name}</span>
                {unread.has(c.id) && <span className="h-2 w-2 rounded-full bg-violet-400" />}
              </button>
            ))}
        </div>

        <div>
          <div className="mb-1 px-2 text-xs uppercase tracking-wide text-zinc-500">
            Direct messages
          </div>
          {members
            .filter((m) => m.userId !== me)
            .map((m) => {
              const dm = dmByUser.get(m.name);
              return (
                <button
                  key={m.userId}
                  type="button"
                  className={row(!!dm && current?.id === dm.id)}
                  onClick={() => void openDm(m.userId)}
                >
                  <span className="truncate">{m.name}</span>
                  {dm && unread.has(dm.id) && (
                    <span className="h-2 w-2 rounded-full bg-violet-400" />
                  )}
                </button>
              );
            })}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-2 text-xs uppercase tracking-wide text-zinc-500">
            <span>Agents</span>
            <button
              type="button"
              className="rounded px-1 text-base leading-none text-zinc-400 hover:bg-zinc-800"
              onClick={() => setShowConnect(true)}
              aria-label="Connect an agent"
            >
              +
            </button>
          </div>
          {agents.map((a) => (
            <div
              key={a.id}
              className="group flex items-center gap-2 rounded px-2 py-1 text-sm text-zinc-400"
            >
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-zinc-700 text-[10px] font-semibold text-zinc-100">
                {INITIALS[a.kind] ?? "AG"}
              </span>
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              {a.online && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
              {a.mine && (
                <button
                  type="button"
                  className="hidden text-xs text-zinc-500 hover:text-red-400 group-hover:block"
                  onClick={() => void removeAgent(a.id)}
                  onBlur={() => setConfirmId(null)}
                  aria-label="Remove agent"
                >
                  {confirmId === a.id ? "Remove?" : "×"}
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
      {showConnect && (
        <ConnectAgent
          wsId={wsId}
          headers={headers}
          onClose={() => {
            setShowConnect(false);
            void loadAgents();
          }}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded border border-zinc-700 px-2 py-0.5 text-sm text-zinc-300 md:hidden"
              onClick={() => setSidebarOpen((v) => !v)}
            >
              Menu
            </button>
            <h1 className="text-sm font-semibold">
              {current ? (current.kind === "dm" ? current.title : `# ${current.name}`) : ""}
            </h1>
          </div>
          <span className={`text-xs ${live ? "text-emerald-400" : "text-amber-400"}`}>
            {live ? "Live" : "Reconnecting…"}
          </span>
        </header>

        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {messages.length === 0 && (
            <p className="text-sm text-zinc-500">No messages yet.</p>
          )}
          {grouped.map(({ m, collapse }) => (
            <div key={m.id} className={collapse ? "mt-0.5" : "mt-3"}>
              {!collapse && (
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{m.authorName}</span>
                  {m.isAgent && <span className="text-xs text-zinc-500">agent</span>}
                  <span className="text-xs text-zinc-500">{hhmm(m.createdAt)}</span>
                </div>
              )}
              <div className="whitespace-pre-wrap break-words text-sm text-zinc-300">
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {err && <div className="px-4 pb-1 text-xs text-red-400">{err}</div>}
        <div className="border-t border-zinc-800 p-3">
          <textarea
            value={text}
            disabled={sending || !current}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={current ? `Message ${current.kind === "dm" ? current.title : "#" + current.name}` : ""}
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-violet-500 disabled:opacity-60"
          />
        </div>
      </main>
    </div>
  );
}
