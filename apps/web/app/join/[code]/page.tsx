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
        };
        if (!res.ok || !j.workspaceId) {
          setError(j.error ?? "Could not join this room.");
          return;
        }
        router.replace(`/workspace/${j.workspaceId}/room`);
      } catch {
        setError("Could not join this room.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-sm">
      {error ? <p className="text-red-400">{error}</p> : <p className="text-zinc-400">Joining…</p>}
    </main>
  );
}
