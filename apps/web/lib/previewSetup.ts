/** What an agent is told when someone asks it to set up the room's preview on a host. */
const COMMON = (host: string) =>
  `Set up a preview of this project on ${host} for my team room. The preview must build from the "draft" branch and have its own link, separate from the public site.

Rules:
- If this project is already on ${host}, use that project and do not change how the public site builds or where it points. Otherwise create a new project from this repo.
- If I am not signed in to ${host}, start the sign-in and wait for me to finish it in the browser. Never ask me to paste a password or key into this chat.
- Ask me before anything that costs money or changes who can see the site.
`;
const AGENT_SETUP: Record<string, string> = {
  vercel:
    COMMON("Vercel") +
    `- Use the vercel command line tool. Vercel builds every branch by itself; find the link that always follows the draft branch (it contains "-git-draft-"), not a link for one single build.
- If the preview asks visitors to log in to Vercel, tell me, because it will not show inside the room until that is turned off for previews. Do not turn it off without asking.
`,
  netlify:
    COMMON("Netlify") +
    `- Use the netlify command line tool. Turn on branch deploys for "draft". The link looks like https://draft--<site-name>.netlify.app.
`,
  railway:
    COMMON("Railway") +
    `- Use the railway command line tool. Add a second environment named "draft" that deploys the draft branch, and give it its own public domain.
`,
  cloudflare:
    COMMON("Cloudflare") +
    `- Use wrangler with a Pages project connected to this repo. The draft branch gets a link like https://draft.<project>.pages.dev.
`,
};
const AGENT_END = `
When the draft link loads, call the room tool "set_preview" with preview_url set to it, and live_url set to the public site if there is one. Then tell me the link in one line.`;


export const SETUP_HOSTS: Record<string, string> = { vercel: "Vercel", netlify: "Netlify", railway: "Railway", cloudflare: "Cloudflare" };

export function setupPrompt(host: string): string | null {
  return AGENT_SETUP[host] ? AGENT_SETUP[host] + AGENT_END : null;
}
