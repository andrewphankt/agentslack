"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MeshPage, STEPS_JOIN, meshGhost, meshTitle } from "@/components/MeshPage";
import { useJsonHeaders } from "@/hooks/useActorUserId";

/** An invite link: join, then straight into the room. The room says "Joined". */
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
          repoAccess?: string;
          alreadyMember?: boolean;
        };
        if (!res.ok || !j.workspaceId) {
          setError(res.status === 404 ? "This invite link does not work. Ask your teammate to copy it again." : (j.error ?? "Could not join this room."));
          return;
        }
        const q = j.alreadyMember
          ? ""
          : `?joined=${j.repoAccess === "invited" || j.repoAccess === "failed" ? j.repoAccess : "1"}`;
        router.replace(`/workspace/${j.workspaceId}/room${q}`);
      } catch {
        setError("Could not join this room.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MeshPage step={2} labels={STEPS_JOIN}>
      {error ? (
        <>
          <h1 className={meshTitle}>That link did not work</h1>
          <p role="alert" className="text-center text-sm text-zinc-600">
            {error}
          </p>
          <Link href="/" className={meshGhost}>
            Back to Mesh
          </Link>
        </>
      ) : (
        <p role="status" className="flex items-center gap-3 text-zinc-500">
          <span aria-hidden className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900 motion-reduce:animate-none" />
          Joining
        </p>
      )}
    </MeshPage>
  );
}
