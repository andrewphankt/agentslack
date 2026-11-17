"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useJsonHeaders } from "@/hooks/useActorUserId";
import { AccountMenu } from "./AccountMenu";
import { AgentNote, UpdateCard } from "./AgentNote";
import { AgentAvatar, Avatar, agentCode } from "./Avatar";
import { Composer } from "./Composer";
import { Confirm } from "./Confirm";
import { ConnectAgent } from "./ConnectAgent";
import { Invite } from "./Invite";
import { RoomSwitcher } from "./RoomSwitcher";
import { MessageBody } from "./MessageBody";
import { PreviewPanel, type DraftInfo } from "./PreviewPanel";
import { SortableRows, applyOrder, useSavedOrder } from "./SortableRows";

type Channel = { id: string; kind: string; name: string; title: string };
type Member = { userId: string; name: string; role: string; avatarUrl?: string | null };
type Msg = {
  id: string;
  authorUserId: string | null;
  authorName: string;
  authorAvatarUrl?: string | null;
  text: string;
  imageUrl?: string | null;
  imageKind?: string;
  isAgent?: boolean;
  edited?: boolean;
  title?: string | null;
  items?: { what: string; who: string }[] | null;
  type?: string;
  createdAt: string;
};
function dayLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

type AgentRow = {
  id: string;
  name: string;
  kind: string;
  label: string;
  short: string;
  purpose?: string | null;
  ownerName: string;
  ownerUserId: string;
  ownerAvatarUrl?: string | null;
  slot: number;
  mine: boolean;
  online: boolean;
  activeFile?: string | null;
};

const CORE = new Set(["updates", "prd", "changes"]);
/** Channels that are a record, not a chat: nobody types in them. */
const FEEDS = new Set(["updates", "changes"]);
const DOTS = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);
const TRASH = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
);
const PENCIL = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  </svg>
);

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
  // Remember this room so signing in lands here next time.
  useEffect(() => {
    document.cookie = `as_last_room=${encodeURIComponent(wsId)}; path=/; max-age=31536000; samesite=lax`;
  }, [wsId]);
  const headers = useJsonHeaders();
  const router = useRouter();
  const searchParams = useSearchParams();
  const welcomeRef = useRef(searchParams.get("welcome") === "1");

  const [wsName, setWsName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
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
  /** A new channel being named, or an existing one being renamed (its id). */
  const [naming, setNaming] = useState<string | null>(null);
  const [nameText, setNameText] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ title: string; body?: string; action: string; run: () => void } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [card, setCard] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [picture, setPicture] = useState<{ file: File; url: string } | null>(null);
  const [savedOrder, saveOrder] = useSavedOrder(me ? `as:channel-order:${wsId}:${me}` : null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [firstConnect, setFirstConnect] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const welcomeDone = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draft, setDraft] = useState<DraftInfo | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const previewOpenRef = useRef(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  previewOpenRef.current = previewOpen;

  const currentRef = useRef<Channel | null>(null);
  const channelsRef = useRef<Channel[]>([]);
  channelsRef.current = channels;
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
    if (!res.ok) return;
    setAgents(((await res.json()) as { agents: AgentRow[] }).agents);
    setAgentsLoaded(true);
  }, [api]);

  const loadDraft = useCallback(async () => {
    const res = await api("/draft");
    if (res.ok) setDraft((await res.json()) as DraftInfo);
  }, [api]);

  const loadDraftRef = useRef(loadDraft);
  loadDraftRef.current = loadDraft;

  // Remember whether the preview panel is open.
  useEffect(() => {
    try {
      if (localStorage.getItem(`as:preview-open:${wsId}`) === "1") setPreviewOpen(true);
    } catch {
      /* storage unavailable */
    }
  }, [wsId]);

  function togglePreview(open: boolean) {
    setPreviewOpen(open);
    try {
      localStorage.setItem(`as:preview-open:${wsId}`, open ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    void loadDraft();
  }, [previewOpen, loadDraft]);

  useEffect(
    () => () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    },
    []
  );

  async function saveLinks(patch: { previewUrl?: string; liveUrl?: string }): Promise<string | null> {
    const res = await api("/draft", { method: "PATCH", body: JSON.stringify(patch) });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return j.error ?? "Could not save the link";
    }
    await loadDraft();
    return null;
  }

  async function askAgent(host: string): Promise<string | null> {
    const res = await api("/agents/ask", { method: "POST", body: JSON.stringify({ host }) });
    if (res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return j.error ?? "Could not reach your agent";
  }

  async function goLive(upTo?: string): Promise<string | null> {
    const fallback = "The site did not respond. Try again in a minute.";
    try {
      const res = await api("/draft/live", { method: "POST", body: JSON.stringify(upTo ? { upTo } : {}) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      await loadDraft();
      if (res.ok && j.ok) return null;
      return j.message ?? fallback;
    } catch {
      return fallback;
    }
  }

  function removeAgent(a: AgentRow) {
    setAsk({
      title: `Disconnect ${a.label}?`,
      body: "It stops saving to this room. You can connect it again any time.",
      action: "Disconnect",
      run: async () => {
        await api(`/agents/${a.id}`, { method: "DELETE" });
        void loadAgents();
      },
    });
  }

  /** The last messages seen in each channel, so going back to one is instant. */
  const seenRef = useRef(new Map<string, Msg[]>());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const openChannel = useCallback((c: Channel, keepPreview = false) => {
    stickRef.current = true;
    const same = currentRef.current?.id === c.id;
    if (!same) {
      // Show what we last saw at once; the fresh copy replaces it when it arrives.
      setMessages(seenRef.current.get(c.id) ?? []);
      setCurrent(c);
    }
    if (previewOpenRef.current && !keepPreview) {
      setPreviewOpen(false);
      try {
        localStorage.setItem(`as:preview-open:${wsId}`, "0");
      } catch {
        /* storage unavailable */
      }
    }
    setSidebarOpen(false);
    setUnread((u) => {
      if (!u.has(c.id)) return u;
      const n = new Set(u);
      n.delete(c.id);
      return n;
    });
  }, [wsId]);

  // Escape closes the mobile sidebar.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // Mount: workspace name + channels, select #general.
  useEffect(() => {
    void (async () => {
      const w = await api("");
      if (w.ok) {
        const wj = (await w.json()) as { name: string; inviteCode?: string };
        setWsName(wj.name);
        setInviteCode(wj.inviteCode ?? "");
      }
      const list = await loadChannels();
      if (list) {
        const prd = welcomeRef.current ? list.find((c) => c.kind === "channel" && c.name === "updates") : undefined;
        const g = prd ?? list.find((c) => c.kind === "channel" && c.name === "general") ?? list[0];
        if (g) openChannel(g, true);
      }
    })();
  }, [api, loadChannels, openChannel]);

  // Agents: on mount and every 30s (online dots); realtime refreshes below.
  useEffect(() => {
    void loadAgents();
    const t = setInterval(() => void loadAgents(), showConnect ? 3_000 : 30_000);
    return () => clearInterval(t);
  }, [loadAgents, showConnect]);

  // Step 3 of setting up: the room stays behind this until you have an agent here.
  useEffect(() => {
    if (!agentsLoaded || welcomeDone.current) return;
    welcomeDone.current = true;
    let skipped = false;
    try {
      skipped = localStorage.getItem(`as:agent-skip:${wsId}`) === "1";
    } catch {
      /* storage unavailable */
    }
    if (agents.some((a) => a.mine) || skipped) return;
    setFirstConnect(true);
    setShowConnect(true);
  }, [agentsLoaded, agents, wsId]);

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
      setLoadedId(current.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, current]);

  useEffect(() => {
    if (current && loadedId === current.id) seenRef.current.set(current.id, messages);
  }, [current, loadedId, messages]);

  const reload = useCallback(async () => {
    const c = currentRef.current;
    if (!c) return;
    const res = await api(`/channels/${c.id}/messages`);
    if (!res.ok || currentRef.current?.id !== c.id) return;
    setMessages(((await res.json()) as { messages: Msg[] }).messages);
  }, [api]);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

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
  /** Bring every list in the room up to date (people, channels, agents, changes, messages). */
  const refreshAllRef = useRef(() => {});
  refreshAllRef.current = () => {
    void loadChannels();
    void loadAgents();
    void loadDraft();
    void fetchNew();
  };

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wasDown = false;

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
        ws.onopen = () => {
          setLive(true);
          // Anything that happened while the line was down.
          if (wasDown) refreshAllRef.current();
          wasDown = true;
        };
        ws.onmessage = (e) => {
          let ev: { type?: string; channelId?: string };
          try {
            ev = JSON.parse(String(e.data));
          } catch {
            return;
          }
          if (ev.type === "chat_message" && ev.channelId) {
            if (!channelsRef.current.some((c) => c.id === ev.channelId)) void loadChannels();
            const changesId = channelsRef.current.find(
              (c) => c.kind === "channel" && c.name === "changes"
            )?.id;
            if (ev.channelId === changesId) {
              void loadDraftRef.current();
              if (previewOpenRef.current) {
                if (reloadTimer.current) clearTimeout(reloadTimer.current);
                reloadTimer.current = setTimeout(() => setReloadKey((k) => k + 1), 40_000);
              }
            }
            if (ev.channelId === currentRef.current?.id) void fetchNew();
            else
              setUnread((u) => {
                const n = new Set(u);
                n.add(ev.channelId!);
                return n;
              });
          } else if (ev.type === "chat_message_changed") {
            if (ev.channelId === currentRef.current?.id) void reloadRef.current();
          } else if (ev.type === "chat_channels_changed" || ev.type === "member_joined" || ev.type === "members_changed") {
            void loadChannels();
          } else if (ev.type === "draft_changed") {
            void loadDraftRef.current();
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

  // Polling fallback when the socket is down: messages often, the rest of the room slowly.
  useEffect(() => {
    if (live || !current) return;
    const t = setInterval(() => void fetchNew(), 5000);
    const slow = setInterval(() => refreshAllRef.current(), 15_000);
    return () => {
      clearInterval(t);
      clearInterval(slow);
    };
  }, [live, current, fetchNew]);

  // Safety net: coming back to the tab brings the whole room up to date.
  useEffect(() => {
    let last = 0;
    const onBack = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 5000) return;
      last = Date.now();
      refreshAllRef.current();
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, []);

  // Auto-scroll.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.dataset.feed ? 0 : el.scrollHeight;
  }, [messages, current]);

  /** Enter or a click away: a new channel is made (named "untitled" if left empty), or the rename is saved. */
  async function commitName() {
    const id = naming;
    if (!id) return;
    setNaming(null);
    const name = nameText.trim();
    setNameText("");
    if (id === "new") {
      const res = await api("/channels", { method: "POST", body: JSON.stringify({ name: name || "untitled", fresh: true }) });
      if (!res.ok) return setErr("Could not create channel");
      const { channel } = (await res.json()) as { channel: Channel };
      await loadChannels();
      openChannel(channel);
      return;
    }
    if (!name) return;
    const res = await api(`/channels/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      return setErr(j.error ?? "Could not rename the channel");
    }
    setErr(null);
    await loadChannels();
  }

  function deleteChannel(c: Channel) {
    setAsk({
      title: `Delete #${c.name}?`,
      body: "Every message in it is deleted for everyone. This cannot be undone.",
      action: "Delete",
      run: async () => {
        const res = await api(`/channels/${c.id}`, { method: "DELETE" });
        if (!res.ok) return setErr("Could not delete the channel");
        const list = await loadChannels();
        if (currentRef.current?.id === c.id) {
          const g = list?.find((x) => x.kind === "channel" && x.name === "general") ?? list?.[0];
          if (g) openChannel(g);
        }
      },
    });
  }

  async function saveEdit(m: Msg) {
    const next = editText.trim();
    setEditId(null);
    if (!next || next === m.text || !current) return;
    const res = await api(`/channels/${current.id}/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ text: next }) });
    if (!res.ok) return setErr("Could not save the change");
    await reload();
  }

  function deleteMessage(m: Msg) {
    setAsk({
      title: "Delete this message?",
      body: "It is removed for everyone.",
      action: "Delete",
      run: async () => {
        if (!current) return;
        const res = await api(`/channels/${current.id}/messages/${m.id}`, { method: "DELETE" });
        if (!res.ok) return setErr("Could not delete the message");
        await reload();
      },
    });
  }

  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopCardTimer = () => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = null;
  };
  /** Resting on a picture opens the card; leaving the picture and the card closes it. */
  // A click pins the card: it stays until a click elsewhere. Hovering never moves a pinned card.
  const cardPinned = useRef(false);
  useEffect(() => {
    if (!card) cardPinned.current = false;
  }, [card]);
  function pinCard(userId: string | null | undefined, el: HTMLElement) {
    stopCardTimer();
    cardPinned.current = true;
    openCard(userId, el);
  }
  function hoverCard(userId: string | null | undefined, el: HTMLElement) {
    if (cardPinned.current) return;
    stopCardTimer();
    cardTimer.current = setTimeout(() => openCard(userId, el), 350);
  }
  function leaveCard() {
    if (cardPinned.current) return;
    stopCardTimer();
    cardTimer.current = setTimeout(() => setCard(null), 180);
  }

  function openCard(userId: string | null | undefined, el: HTMLElement) {
    if (!userId) return;
    const r = el.getBoundingClientRect();
    setCard({
      userId,
      x: Math.max(8, Math.min(r.left, window.innerWidth - 256)),
      y: Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 240)),
    });
  }

  // Menus and the person card close on Escape or a click elsewhere.
  useEffect(() => {
    if (!menuId && !card) return;
    const close = () => {
      setMenuId(null);
      setCard(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-pop]")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId, card]);

  async function openDm(userId: string) {
    const res = await api("/channels", { method: "POST", body: JSON.stringify({ userId }) });
    if (!res.ok) return setErr("Could not open conversation");
    const { channel } = (await res.json()) as { channel: Channel };
    await loadChannels();
    openChannel(channel);
  }

  function attach(file: File | null | undefined) {
    if (!file) return;
    const isVideo = /^video\/(mp4|webm|quicktime)$/.test(file.type);
    if (!isVideo && !/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      return setErr("Only PNG, JPG, GIF, WebP, MP4, WebM or MOV files");
    }
    if (isVideo ? file.size > 25 * 1024 * 1024 : file.size > 5 * 1024 * 1024) {
      return setErr(isVideo ? "Videos can be up to 25 MB" : "Pictures can be up to 5 MB");
    }
    setErr(null);
    setPicture((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  async function send() {
    const body = text.trim();
    if ((!body && !picture) || !current || sending) return;
    setSending(true);
    try {
      let imageId: string | undefined;
      if (picture) {
        const up = await api(`/channels/${current.id}/images`, {
          method: "POST",
          headers: { "Content-Type": picture.file.type },
          body: picture.file,
        });
        if (!up.ok) {
          const j = (await up.json().catch(() => ({}))) as { error?: string };
          return setErr(j.error ?? "File failed to upload");
        }
        imageId = ((await up.json()) as { id: string }).id;
      }
      const res = await api(`/channels/${current.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: body, imageId }),
      });
      if (!res.ok) return setErr("Message failed to send");
      const { message } = (await res.json()) as { message: Msg };
      setErr(null);
      setText("");
      if (picture) URL.revokeObjectURL(picture.url);
      setPicture(null);
      stickRef.current = true;
      setMessages((p) => mergeMsgs(p, [message]));
    } finally {
      setSending(false);
    }
  }

  async function sendNow(body: string) {
    if (!current || !body.trim()) return;
    const res = await api(`/channels/${current.id}/messages`, { method: "POST", body: JSON.stringify({ text: body.trim() }) });
    if (!res.ok) return setErr("Message failed to send");
    const { message } = (await res.json()) as { message: Msg };
    setErr(null);
    stickRef.current = true;
    setMessages((p) => mergeMsgs(p, [message]));
  }

  const isFeed = current?.kind === "channel" && FEEDS.has(current.name);
  type Shown = { sep: string; m?: undefined; collapse?: undefined } | { sep?: undefined; m: Msg; collapse: boolean };
  const grouped = useMemo<Shown[]>(() => {
    const list = isFeed ? [...messages].reverse() : messages;
    const out: Shown[] = [];
    list.forEach((m, i) => {
      const prev = list[i - 1];
      const gap = prev ? Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) : 0;
      const sameWho = !!prev && prev.isAgent === m.isAgent && prev.authorUserId === m.authorUserId && prev.authorName === m.authorName;
      if (isFeed) {
        const day = dayLabel(m.createdAt);
        const newDay = !prev || dayLabel(prev.createdAt) !== day;
        if (newDay) out.push({ sep: day });
        // One person's run of changes reads as one group.
        out.push({ m, collapse: !newDay && sameWho && gap < 30 * 60_000 });
      } else {
        out.push({ m, collapse: sameWho && !m.isAgent && gap < 5 * 60_000 });
      }
    });
    return out;
  }, [messages, isFeed]);

  const agentKindByLabel = useMemo(
    () => new Map(agents.map((a) => [a.label, a.kind])),
    [agents]
  );
  const agentByLabel = useMemo(() => new Map(agents.map((a) => [a.label, a])), [agents]);

  const orderedChannels = useMemo(
    () => applyOrder(channels.filter((c) => c.kind === "channel" && !CORE.has(c.name)), savedOrder),
    [channels, savedOrder]
  );

  const keepPinned = useCallback(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.dataset.feed ? 0 : el.scrollHeight;
  }, []);

  const gifSearch = useCallback(
    async (q: string) => {
      const r = await api(`/gifs?q=${encodeURIComponent(q)}`);
      return r.ok ? ((await r.json()) as { on: boolean; items: { thumb: string; url: string; title: string }[] }) : { on: false, items: [] };
    },
    [api]
  );

  const dmByUser = useMemo(() => {
    const map = new Map<string, Channel>();
    for (const c of channels) if (c.kind === "dm") map.set(c.title, c);
    return map;
  }, [channels]);

  const row = (active: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
      active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-200/70"
    }`;
  const heading = "text-[11px] uppercase tracking-wide text-zinc-500";
  const plus =
    "rounded px-1 text-base leading-none text-zinc-500 hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900";
  const unreadDot = <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-500" />;
  const feed = current?.kind === "channel" && FEEDS.has(current.name);
  const working = agents.filter((a) => a.online && a.activeFile);
  const dockOpen = working.length > 0 && current?.kind === "channel" && !feed;
  const others = members.filter((m) => m.userId !== me);
  const shownMembers = others.slice(0, 5);
  const mine = members.find((m) => m.userId === me);
  const myAgent = agents.find((a) => a.mine)?.name ?? null;
  const memberNames = useMemo(
    () => [...members.map((m) => m.name), ...new Set(agents.map((a) => a.name))],
    [members, agents]
  );
  const cardOf = card ? members.find((m) => m.userId === card.userId) : undefined;
  const avatarByName = useMemo(() => new Map(members.map((m) => [m.name, m.avatarUrl ?? null])), [members]);
  const onlineIds = useMemo(() => new Set(agents.filter((a) => a.online).map((a) => a.id)), [agents]);
  const newCount = draft?.status?.state === "ready" ? draft.status.ahead : 0;
  const menuBtn = (
    <button
      type="button"
      aria-label="Open menu"
      aria-expanded={sidebarOpen}
      className="-ml-1 rounded p-1 text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 md:hidden"
      onClick={() => setSidebarOpen((v) => !v)}
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    </button>
  );
  const account = (
    <AccountMenu name={mine?.name ?? ""} avatarUrl={mine?.avatarUrl} headers={headers} onRenamed={() => void loadChannels()} />
  );

  /** Right side of every header: teammates, Invite, the live dot and your picture. */
  const headerRight = (
    <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center pl-1.5">
              {shownMembers.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  title={m.name}
                  aria-label={`About ${m.name}`}
                  onMouseDown={(e) => e.stopPropagation()}
                      data-pop
                      onClick={(e) => pinCard(m.userId, e.currentTarget)}
                      onMouseEnter={(e) => hoverCard(m.userId, e.currentTarget)}
                      onMouseLeave={leaveCard}
                  className="-ml-1.5 inline-flex rounded-full ring-2 ring-white focus-visible:outline-none focus-visible:ring-zinc-900"
                >
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size={24} />
                </button>
              ))}
              {others.length > 5 && (
                <span
                  title={others.slice(5).map((m) => m.name).join(", ")}
                  className="-ml-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-zinc-200 px-1 text-[11px] font-medium text-zinc-700 ring-2 ring-white"
                >
                  +{others.length - 5}
                </span>
              )}
            </div>
            <Invite
              inviteCode={inviteCode}
              roomName={wsName}
              people={members.map((m) => (
                <span key={m.userId} title={m.name} className="inline-flex">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} size={24} />
                </span>
              ))}
            />
            <span
              role="img"
              title={live ? "Live" : "Reconnecting"}
              aria-label={live ? "Live" : "Reconnecting"}
              className={`h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {account}
    </div>
  );

  return (
    <div className="fixed inset-0 flex bg-white text-zinc-900" style={{ colorScheme: "light" }}>
      {sidebarOpen && (
        <div
          aria-hidden
          className="absolute inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`${sidebarOpen ? "absolute inset-y-0 left-0 z-20 flex" : "hidden"} w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-200 bg-[#f5f5f3] p-3 md:static md:z-auto md:flex`}
      >
        <RoomSwitcher wsId={wsId} name={wsName} headers={headers} />

        <div className="flex flex-col gap-px">
        <button
          type="button"
          className={row(previewOpen)}
          aria-current={previewOpen ? "true" : undefined}
          onClick={() => {
            togglePreview(true);
            setSidebarOpen(false);
          }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <svg viewBox="0 0 24 24" className="mx-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="13" rx="1.5" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span className="truncate">Preview</span>
          </span>
          {newCount > 0 && <span className={`text-xs ${previewOpen ? "text-zinc-300" : "text-zinc-500"}`}>{newCount}</span>}
        </button>
        {(["updates", "changes"] as const).map((name) => {
          const c = channels.find((x) => x.kind === "channel" && x.name === name);
          if (!c) return null;
          const active = !previewOpen && current?.id === c.id;
          return (
            <button key={name} type="button" className={row(active)} aria-current={active ? "true" : undefined} onClick={() => openChannel(c)}>
              <span className="flex min-w-0 items-center gap-2">
                <svg viewBox="0 0 24 24" className="mx-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {name === "updates" ? <path d="M5 21V4h11l-1.5 4L16 12H5" /> : <path d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" />}
                </svg>
                <span className="truncate">{name === "updates" ? "Updates" : "Changes"}</span>
              </span>
              {unread.has(c.id) && unreadDot}
            </button>
          );
        })}
        </div>

        <div>
          <div className={`mb-1 flex items-center justify-between px-2 ${heading}`}>
            <span>Channels</span>
            <button
              type="button"
              className={plus}
              onClick={() => {
                setNameText("");
                setNaming("new");
              }}
              aria-label="New channel"
            >
              +
            </button>
          </div>
          <SortableRows
            label="Channels"
            items={orderedChannels}
            onReorder={saveOrder}
            renderItem={(c) => {
              const active = !previewOpen && current?.id === c.id;
              if (naming === c.id) return (
                <div className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm ${active ? "bg-zinc-900 text-white" : "text-zinc-700"}`}>
                <span aria-hidden className="w-5 shrink-0 text-center opacity-60">#</span>
                <input
                  autoFocus
                  value={nameText}
                  maxLength={40}
                  placeholder={c.name}
                  aria-label="Channel name"
                  onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setNameText(e.target.value)}
                  onBlur={() => void commitName()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      setNameText("");
                      setNaming(null);
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent p-0 text-sm caret-current outline-none placeholder:text-zinc-400"
                />
              </div>
              );
              return (
                <div className="group relative">
                  <button
                    type="button"
                    className={`${row(active)} ${CORE.has(c.name) ? "" : "pr-7"}`}
                    onClick={() => openChannel(c)}
                    aria-current={active ? "true" : undefined}
                    title="Drag, or Alt+Up and Alt+Down, to reorder"
                  >
                    <span className="flex min-w-0 items-center gap-2"><span aria-hidden className="w-5 shrink-0 text-center opacity-60">#</span><span className="truncate">{c.name}</span></span>
                    {unread.has(c.id) && unreadDot}
                  </button>
                  {!CORE.has(c.name) && (
                    <button
                      type="button"
                      aria-label={`Options for ${c.name}`}
                      data-pop
                      aria-haspopup="menu"
                      aria-expanded={menuId === c.id}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setMenuId((v) => (v === c.id ? null : c.id))}
                      className={`absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 group-hover:opacity-100 ${
                        menuId === c.id ? "opacity-100" : "opacity-0"
                      } ${active ? "text-white hover:bg-zinc-700" : "text-zinc-500 hover:bg-zinc-300"}`}
                    >
                      {DOTS}
                    </button>
                  )}
                  {menuId === c.id && (
                    <div
                      data-pop
                      role="menu"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="pop-in absolute right-0 top-full z-30 mt-1 w-36 rounded-md border border-zinc-900 bg-white p-1 text-zinc-900"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-zinc-100"
                        onClick={() => {
                          setMenuId(null);
                          setNameText(c.name);
                          setNaming(c.id);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-8 w-full items-center rounded px-2 text-left text-sm text-red-700 hover:bg-zinc-100"
                        onClick={() => {
                          setMenuId(null);
                          deleteChannel(c);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            }}
          />
          {naming === "new" && (
            <div className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm ${false ? "bg-zinc-900 text-white" : "text-zinc-700"}`}>
                <span aria-hidden className="w-5 shrink-0 text-center opacity-60">#</span>
                <input
                  autoFocus
                  value={nameText}
                  maxLength={40}
                  placeholder="untitled"
                  aria-label="Channel name"
                  onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => setNameText(e.target.value)}
                  onBlur={() => void commitName()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      setNameText("");
                      setNaming(null);
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent p-0 text-sm caret-current outline-none placeholder:text-zinc-400"
                />
              </div>
          )}
        </div>

        <div>
          <div className={`mb-1 px-2 ${heading}`}>People</div>
          {members
            .filter((m) => m.userId !== me)
            .map((m) => {
              const dm = dmByUser.get(m.name);
              return (
                <button
                  key={m.userId}
                  type="button"
                  className={row(!previewOpen && !!dm && current?.id === dm.id)}
                  onClick={() => void openDm(m.userId)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={m.name} avatarUrl={m.avatarUrl} size={20} />
                    <span className="truncate">{m.name}</span>
                  </span>
                  {dm && unread.has(dm.id) && unreadDot}
                </button>
              );
            })}
        </div>

        <div>
          <div className={`mb-1 flex items-center justify-between px-2 ${heading}`}>
            <span>Agents</span>
            <button
              type="button"
              className={plus}
              onClick={() => setShowConnect(true)}
              aria-label="Connect an agent"
            >
              +
            </button>
          </div>
          {agents.map((a) => (
            <div key={a.id} className="group flex items-center gap-2 rounded px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-200/70">
              <AgentAvatar ownerName={a.ownerName} ownerAvatarUrl={a.ownerAvatarUrl} kind={a.kind} size={20} />
              <span
                className={`min-w-0 flex-1 ${a.online ? "" : "opacity-50"}`}
                title={a.online ? a.label : `${a.label} (not running)`}
              >
                <span className="block truncate">{a.short}</span>
                {a.activeFile && <span className="block truncate text-xs text-zinc-500">{a.activeFile}</span>}
              </span>
              {a.online && <span className={`h-2 w-2 rounded-full bg-emerald-500 ${a.mine ? "group-focus-within:hidden group-hover:hidden" : ""}`} />}
              {a.mine && (
                <button
                  type="button"
                  className="hidden h-5 w-5 place-items-center rounded text-zinc-400 hover:text-red-600 focus-visible:grid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 group-hover:grid"
                  onClick={() => removeAgent(a)}
                  aria-label={`Disconnect ${a.label}`}
                  title="Disconnect"
                >
                  {TRASH}
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
          mode={firstConnect ? "first" : "default"}
          summary={firstConnect && welcomeRef.current}
          onlineIds={onlineIds}
          roomName={wsName}
          onClose={() => {
            setShowConnect(false);
            if (firstConnect) {
              setFirstConnect(false);
              try {
                localStorage.setItem(`as:agent-skip:${wsId}`, "1");
              } catch {
                /* storage unavailable */
              }
              if (welcomeRef.current) router.replace(`/workspace/${wsId}/room`);
            }
            void loadAgents();
          }}
        />
      )}

      <div className="relative flex min-w-0 flex-1">
      {previewOpen ? (
        <PreviewPanel
          draft={draft}
          reloadKey={reloadKey}
          lead={menuBtn}
          trail={headerRight}
          avatars={avatarByName}
          onSaveLinks={saveLinks}
          onGoLive={goLive}
          agent={myAgent}
          onAskAgent={askAgent}
          roomApi={api}
        />
      ) : (
      <>
      <main
        className="flex min-w-0 flex-1 flex-col bg-white text-zinc-900"
        style={{ colorScheme: "light" }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {menuBtn}
            <h1 className="truncate text-sm font-semibold">
              {current ? (current.kind === "dm" ? current.title : feed ? (current.name === "updates" ? "Updates" : "Changes") : `# ${current.name}`) : ""}
            </h1>
          </div>
          {headerRight}
        </header>

        <div
          ref={listRef}
          data-feed={feed ? "1" : undefined}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.dataset.feed ? el.scrollTop < 80 : el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {messages.length === 0 && loadedId === current?.id && (
            <p className="text-sm text-zinc-500">
              {current?.kind === "channel" && current.name === "updates"
                ? "Nothing published yet. Each time someone presses Publish, what went out is posted here."
                : current?.kind === "channel" && current.name === "changes"
                  ? "No changes yet. Each time an agent finishes a turn, what it changed is posted here."
                  : "No messages yet."}
            </p>
          )}
          {grouped.map((g) => {
            if (g.sep !== undefined)
              return (
                <div key={`day-${g.sep}`} className="mt-6 flex items-center gap-3 first:mt-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{g.sep}</span>
                  <span className="h-px flex-1 bg-zinc-200" />
                </div>
              );
            const { m, collapse } = g;
            const ag = m.isAgent ? agentByLabel.get(m.authorName) : undefined;
            const who = m.isAgent ? ag?.ownerUserId : m.authorUserId;
            const own = !m.isAgent && m.authorUserId === me;
            return (
              <div key={m.id} className={`group relative -mx-4 flex gap-3 px-4 py-0.5 hover:bg-zinc-50 ${collapse ? (feed ? "mt-1.5" : "") : feed ? "mt-4" : "mt-2.5"}`}>
                <div className="w-8 shrink-0">
                  {collapse ? (
                    <span className="hidden pt-0.5 text-right text-[10px] leading-4 text-zinc-400 group-hover:block">{hhmm(m.createdAt)}</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`About ${m.authorName}`}
                      onMouseDown={(e) => e.stopPropagation()}
                      data-pop
                      onClick={(e) => pinCard(who, e.currentTarget)}
                      onMouseEnter={(e) => hoverCard(who, e.currentTarget)}
                      onMouseLeave={leaveCard}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
                    >
                      {ag ? (
                        <AgentAvatar ownerName={ag.ownerName} ownerAvatarUrl={ag.ownerAvatarUrl} kind={ag.kind} size={32} ring="ring-white" />
                      ) : (
                        <Avatar
                          name={m.authorName}
                          avatarUrl={m.authorAvatarUrl}
                          agent={m.isAgent}
                          code={m.isAgent ? agentCode(agentKindByLabel.get(m.authorName)) : undefined}
                          size={32}
                        />
                      )}
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {!collapse && (
                    <div className="flex items-baseline gap-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                      data-pop
                      onClick={(e) => pinCard(who, e.currentTarget)}
                      onMouseEnter={(e) => hoverCard(who, e.currentTarget)}
                      onMouseLeave={leaveCard}
                        className="rounded text-sm font-semibold text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                      >
                        {m.authorName}
                      </button>
                      {m.isAgent && <span className="text-xs text-zinc-500">agent</span>}
                      <span className="text-xs text-zinc-400">{hhmm(m.createdAt)}</span>
                    </div>
                  )}
                  {editId === m.id ? (
                    <div className="mt-1">
                      <textarea
                        autoFocus
                        value={editText}
                        rows={Math.min(6, editText.split("\n").length)}
                        aria-label="Edit message"
                        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void saveEdit(m);
                          }
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="w-full max-w-[72ch] resize-none rounded border border-zinc-900 bg-white px-2 py-1.5 text-sm outline-none"
                      />
                      <div className="mt-1 flex gap-2 text-xs">
                        <button type="button" className="font-semibold text-zinc-900 hover:underline" onClick={() => void saveEdit(m)}>
                          Save
                        </button>
                        <button type="button" className="text-zinc-500 hover:underline" onClick={() => setEditId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : m.type === "update" ? (
                    <UpdateCard title={m.title ?? "Update"} items={m.items} text={m.text} />
                  ) : m.type === "prd" ? (
                    <UpdateCard title="The plan" text={m.text} />
                  ) : m.isAgent && (m.type === undefined || m.type === "note") ? (
                    <AgentNote text={m.text} />
                  ) : (
                    <MessageBody
                      text={m.text}
                      imageUrl={m.imageUrl}
                      imageKind={m.imageKind}
                      alt={m.text || `Picture from ${m.authorName}`}
                      onLoaded={keepPinned}
                      mentions={memberNames}
                    />
                  )}
                  {m.edited && editId !== m.id && <span className="text-[11px] text-zinc-400">edited</span>}
                </div>
                {own && editId !== m.id && (
                  <div className="absolute -top-3 right-4 hidden overflow-hidden rounded border border-zinc-200 bg-white group-focus-within:flex group-hover:flex">
                    {m.text && (
                      <button
                        type="button"
                        aria-label="Edit message"
                        title="Edit"
                        className="grid h-7 w-7 place-items-center text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                        onClick={() => {
                          setEditText(m.text);
                          setEditId(m.id);
                        }}
                      >
                        {PENCIL}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Delete message"
                      title="Delete"
                      className="grid h-7 w-7 place-items-center text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
                      onClick={() => deleteMessage(m)}
                    >
                      {TRASH}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {err && <div className="px-4 pb-1 text-xs text-red-600">{err}</div>}
        {feed ? (
          <p className="border-t border-zinc-200 px-4 py-3 text-sm text-zinc-500">
            {current?.name === "updates" ? "One post each time the team publishes." : "One post each time an agent finishes a turn."} Talk about it in a channel.
          </p>
        ) : (
        <div
          className="border-t border-zinc-200 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            attach(e.dataTransfer.files?.[0]);
          }}
        >
          {picture && (
            <div className="mb-2 inline-flex items-start gap-1">
              {picture.file.type.startsWith("video/") ? (
                <video
                  src={picture.url}
                  muted
                  playsInline
                  preload="metadata"
                  aria-label="Video to send"
                  className="h-20 rounded border border-zinc-200"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picture.url} alt="Picture to send" className="h-20 rounded border border-zinc-200" />
              )}
              <button
                type="button"
                aria-label="Remove attachment"
                className="grid h-6 w-6 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                onClick={() => {
                  URL.revokeObjectURL(picture.url);
                  setPicture(null);
                }}
              >
                ×
              </button>
            </div>
          )}
          <Composer
            value={text}
            onChange={setText}
            onSend={() => void send()}
            onFile={attach}
            disabled={!current}
            sending={sending}
            placeholder={current ? `Message ${current.kind === "dm" ? current.title : "#" + current.name}` : ""}
            names={memberNames}
            agent={myAgent}
            gifSearch={gifSearch}
            onSendNow={(t) => void sendNow(t)}
          />
        </div>
        )}
      </main>
      <aside
        aria-label="Working now"
        aria-hidden={!dockOpen}
        className="hidden shrink-0 overflow-hidden bg-white text-zinc-900 md:block"
        style={{ width: dockOpen ? 240 : 0, transition: "width 0.32s cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="h-full w-60 border-l border-zinc-200 p-3">
          <div className={`mb-2 px-1 ${heading}`}>Working now</div>
          {working.map((a) => (
            <div key={a.id} className="soft-in flex items-center gap-3 border-t border-zinc-200 px-1 py-2 text-sm">
              <AgentAvatar ownerName={a.ownerName} ownerAvatarUrl={a.ownerAvatarUrl} kind={a.kind} size={20} ring="ring-white" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.activeFile}</span>
                <span className="block truncate text-xs text-zinc-500">{a.ownerName}</span>
              </span>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            </div>
          ))}
        </div>
      </aside>
      </>
      )}
      </div>
      {card && cardOf && (
        <div
                      data-pop
          role="dialog"
          aria-label={cardOf.name}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={stopCardTimer}
          onMouseLeave={leaveCard}
          className="pop-in fixed z-40 w-60 rounded-md border border-zinc-900 bg-white p-3 text-zinc-900"
          style={{ left: card.x, top: card.y }}
        >
          <div className="flex items-center gap-3">
            <Avatar name={cardOf.name} avatarUrl={cardOf.avatarUrl} size={32} />
            <span className="min-w-0 truncate text-[15px] font-semibold">{cardOf.name}</span>
          </div>
          {agents.some((a) => a.ownerUserId === cardOf.userId) && (
            <div className="mt-3 border-t border-zinc-200 pt-2">
              {agents
                .filter((a) => a.ownerUserId === cardOf.userId)
                .map((a) => (
                  <div key={a.id} className="flex items-center gap-2 py-1 text-sm">
                    <AgentAvatar ownerName={a.ownerName} ownerAvatarUrl={a.ownerAvatarUrl} kind={a.kind} size={20} ring="ring-white" />
                    <span className="min-w-0 flex-1 truncate pl-1">{a.activeFile ?? (a.online ? "Running" : "Not running")}</span>
                    {a.online && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                  </div>
                ))}
            </div>
          )}
          {cardOf.userId !== me && (
            <button
              type="button"
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded bg-zinc-900 text-sm font-semibold text-white hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
              onClick={() => {
                setCard(null);
                void openDm(cardOf.userId);
              }}
            >
              Message
            </button>
          )}
        </div>
      )}
      {ask && (
        <Confirm
          title={ask.title}
          body={ask.body}
          action={ask.action}
          onCancel={() => setAsk(null)}
          onConfirm={() => {
            const run = ask.run;
            setAsk(null);
            run();
          }}
        />
      )}
    </div>
  );
}
