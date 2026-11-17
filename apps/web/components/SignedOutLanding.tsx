import { GitHubIcon, MeshPage, meshSolid } from "@/components/MeshPage";

/** The signed-out front page: the name, one sentence, one GitHub button. */
export function SignedOutLanding({ next = "/" }: { next?: string }) {
  return (
    <MeshPage>
      <h1 className="text-[22px] font-bold leading-tight tracking-tight">Build one project together.</h1>
      <p className="mt-2 text-sm text-zinc-600">
        One room for your team and your agents. Everyone keeps working in their own terminal.
      </p>
      <a
        href={`/api/auth/github/signin/start?return_to=${encodeURIComponent(next)}`}
        className={`${meshSolid} mt-6 h-11 w-full`}
      >
        <GitHubIcon white />
        Continue with GitHub
      </a>
      <p className="mt-3 text-xs text-zinc-500">Your project lives on GitHub. Mesh works with the one you pick.</p>
    </MeshPage>
  );
}
