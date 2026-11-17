import { GitHubIcon, MeshPage, STEPS_JOIN, Wordmark, meshBig, meshTitle } from "@/components/MeshPage";

/** The signed-out front page: one line and one GitHub button. An invite link names the room instead. */
export function SignedOutLanding({ next = "/", invitedTo }: { next?: string; invitedTo?: string }) {
  return (
    <MeshPage step={1} labels={invitedTo ? STEPS_JOIN : undefined}>
      <div className="flex flex-col items-center gap-4">
        <Wordmark className="text-sm" />
        {invitedTo ? (
          <h1 className={meshTitle}>
            You have been invited to <span className="whitespace-nowrap">{invitedTo}</span>
          </h1>
        ) : (
          <h1 className={meshTitle}>Build one project together</h1>
        )}
      </div>
      <a href={`/api/auth/github/signin/start?return_to=${encodeURIComponent(next)}`} className={meshBig}>
        <GitHubIcon white />
        Continue with GitHub
      </a>
    </MeshPage>
  );
}
