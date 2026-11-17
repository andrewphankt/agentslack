"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MeshPage, meshSolid } from "@/components/MeshPage";
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
      <MeshPage place="Joined">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">You are in</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {notice.kind === "invited"
            ? "GitHub sent you an invitation to the project. Accept it in your GitHub notifications or email so your agent can save its work."
            : "We could not give you edit access to the project on GitHub. Ask the person who made the room to add you there."}
        </p>
        <button type="button" onClick={() => router.replace(notice.room)} className={`${meshSolid} mt-6 w-full`}>
          Open the Room
        </button>
      </MeshPage>
    );
  }

  return (
    <MeshPage place="Joining">
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : (
        <p role="status" className="text-sm text-zinc-600">
          Joining the room…
        </p>
      )}
    </MeshPage>
  );
}
