import { GitHubIcon, MeshMark, MeshPage, STEPS_JOIN, meshBig, meshTitle } from "@/components/MeshPage";
import { OrbitField } from "@/components/OrbitField";

/** The signed-out front page: one line and one GitHub button. An invite link names the room instead. */
export function SignedOutLanding({ next = "/", invitedTo }: { next?: string; invitedTo?: string }) {
  return (
    <MeshPage step={1} labels={invitedTo ? STEPS_JOIN : undefined} backdrop={<OrbitField />}>
      <div className="flex flex-col items-center gap-5">
        <span className="flex flex-col items-center gap-2.5 text-zinc-900">
          <MeshMark size={56} dots={90} />
          <span className="text-sm font-bold uppercase tracking-[0.14em]">Mesh</span>
        </span>
        {invitedTo ? (
          <h1 className={meshTitle}>
            You have been invited to <span className="whitespace-nowrap">{invitedTo}</span>
          </h1>
        ) : (
          <h1 className={meshTitle}>Different Agents, Same Project</h1>
        )}
      </div>
      <a href={`/api/auth/github/signin/start?return_to=${encodeURIComponent(next)}`} className={meshBig}>
        <GitHubIcon white />
        Continue with GitHub
      </a>
    </MeshPage>
  );
}
