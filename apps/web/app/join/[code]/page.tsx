"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useJsonHeaders } from "@/hooks/useActorUserId";

export default function JoinPage() {
  const params = useParams();
  const code = params.code as string;
  const router = useRouter();
  const headers = useJsonHeaders();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ kind: string; room: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/workspaces/join", {
          method: "POST",
          headers,
          body: JSON.stringify({ inviteCode: code }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          workspaceId?: string;
          error?: string;
          repoAccess?: string;
        };
        if (!res.ok || !j.workspaceId) {
          setError(j.error ?? "Could not join this room.");
          return;
        }
        const room = `/workspace/${j.workspaceId}/room`;
        if (j.repoAccess === "invited" || j.repoAccess === "failed") {
          setNotice({ kind: j.repoAccess, room });
          return;
        }
        router.replace(room);
      } catch {
        setError("Could not join this room.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (notice) {
    return (
      <main className="grid min-h-[60vh] place-items-center p-6 text-sm">
        <div className="max-w-sm text-center">
          <p className="text-zinc-200">You joined the room.</p>
          <p className="mt-2 text-zinc-400">
            {notice.kind === "invited"
              ? "GitHub sent you an invitation to the project. Accept it in your GitHub notifications or email so your agent can save its work."
              : "We could not give you edit access to the project on GitHub. Ask the person who made the room to add you there."}
          </p>
          <button
            type="button"
            onClick={() => router.replace(notice.room)}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
          >
            Open the room
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-sm">
      {error ? <p className="text-red-400">{error}</p> : <p className="text-zinc-400">Joining…</p>}
    </main>
  );
}
