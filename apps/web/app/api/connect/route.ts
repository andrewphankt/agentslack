import { prisma } from "@/lib/prisma";
import { agentFromBearer, hashAgentToken } from "@/lib/agents";
import { broadcastWorkspaceEvent } from "@/lib/realtime/broadcast";

export const dynamic = "force-dynamic";

/** The installer found an older key in this folder: remove that agent, the new one takes its place. */
export async function POST(req: Request) {
  const agent = await agentFromBearer(req);
  if (!agent) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const old = String((await req.formData().catch(() => null))?.get("old") ?? "");
  if (!old.startsWith("as_")) {
    // A plain check-in: the installer finished, so the room can show this agent as connected.
    await broadcastWorkspaceEvent(agent.workspaceId, { type: "agents_changed" });
    return Response.json({ replaced: 0 });
  }
  const gone = await prisma.agent.deleteMany({
    where: {
      tokenHash: hashAgentToken(old),
      workspaceId: agent.workspaceId,
      ownerUserId: agent.ownerUserId,
      id: { not: agent.id },
    },
  });
  if (gone.count) await broadcastWorkspaceEvent(agent.workspaceId, { type: "agents_changed" });
  return Response.json({ replaced: gone.count });
}

/**
 * `curl -fsSL ORIGIN/api/connect | sh -s -- TOKEN`
 * Sets up the three Claude Code hooks in the current git clone. POSIX sh only.
 * Written with String.raw and no backticks or dollar-brace so the shell text stays literal.
 */
const SCRIPT = String.raw`#!/bin/sh
# AgentSlack connect: wires this clone to the team room.
ORIGIN='__ORIGIN__'
TOKEN="$1"
fail() { echo "agentslack: $1" >&2; exit 1; }

case "$TOKEN" in as_*) ;; *) fail "missing key. Run: curl -fsSL $ORIGIN/api/connect | sh -s -- YOUR_KEY" ;; esac
git rev-parse --show-toplevel >/dev/null 2>&1 || fail "run this inside your project folder (a git clone)."
git remote get-url origin >/dev/null 2>&1 || fail "this folder has no 'origin' remote. Clone the team's GitHub repo first."
cd "$(git rev-parse --show-toplevel)" || fail "cannot enter the project folder."

# Connecting again in the same folder replaces the old agent instead of adding another.
OLD=$(git config --local agentslack.token 2>/dev/null)
if [ -n "$OLD" ] && [ "$OLD" != "$TOKEN" ]; then
  curl -fsS --max-time 5 -X POST -H "Authorization: Bearer $TOKEN" --data-urlencode "old=$OLD" "$ORIGIN/api/connect" >/dev/null 2>&1
fi
git config --local agentslack.token "$TOKEN"
git config --local agentslack.url "$ORIGIN"

# Keep our own files out of the team's commits (local only).
mkdir -p .git/info
touch .git/info/exclude
for pat in '.agentslack/' '.claude/settings.local.json'; do
  grep -qxF "$pat" .git/info/exclude || echo "$pat" >> .git/info/exclude
done

mkdir -p .agentslack/hooks .claude

cat > .agentslack/hooks/prompt.sh <<'AS_EOF'
#!/bin/sh
# UserPromptSubmit: pull the team's latest, tell the agent, record intent.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
T=$(git config --local agentslack.token 2>/dev/null)
U=$(git config --local agentslack.url 2>/dev/null)
[ -n "$T" ] && [ -n "$U" ] || exit 0
curl -fsS --max-time 3 -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data-binary @- "$U/api/hook/prompt" 2>/dev/null
[ -f .agentslack/no-pull ] && exit 0
before=$(git rev-parse HEAD 2>/dev/null) || exit 0
if ! git pull -q --rebase --autostash origin draft >/dev/null 2>&1; then
  git rebase --abort >/dev/null 2>&1
  exit 0
fi
after=$(git rev-parse HEAD)
if [ "$before" != "$after" ]; then
  echo "ROOM UPDATE: teammates changed the project since your last turn. Your files are already up to date."
  git log --format='- %an: %s' "$before..$after"
  git diff --stat "$before..$after" | tail -5
fi
exit 0
AS_EOF

cat > .agentslack/hooks/before-edit.sh <<'AS_EOF'
#!/bin/sh
# PreToolUse on Edit|Write: ask the room who else is in this file.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
T=$(git config --local agentslack.token 2>/dev/null)
U=$(git config --local agentslack.url 2>/dev/null)
[ -n "$T" ] && [ -n "$U" ] || exit 0
curl -fsS --max-time 3 -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data-binary @- "$U/api/hook/before-edit" 2>/dev/null
exit 0
AS_EOF

cat > .agentslack/hooks/stop.sh <<'AS_EOF'
#!/bin/sh
# Stop: save this turn to the shared draft. Nobody types a git command.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
T=$(git config --local agentslack.token 2>/dev/null)
U=$(git config --local agentslack.url 2>/dev/null)
[ -n "$T" ] && [ -n "$U" ] || exit 0
me=$(git config user.name 2>/dev/null); [ -n "$me" ] || me=teammate
pending=.agentslack/pending-files
if git grep -qE '^(<<<<<<<|>>>>>>>) ' >/dev/null 2>&1; then
  echo '{"decision":"block","reason":"Conflict markers are still in the files. Finish combining both versions, remove every marker, then stop."}'
  exit 0
fi
before=$(git rev-parse HEAD 2>/dev/null) || exit 0
git add -A >/dev/null 2>&1
if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  git commit -q --no-edit >/dev/null 2>&1
elif ! git diff --cached --quiet; then
  git commit -q -m "Saved turn" >/dev/null 2>&1
  git diff --name-only "$before" HEAD >> "$pending" 2>/dev/null
fi
if ! git pull -q --no-rebase --no-edit origin draft >/dev/null 2>&1; then
  files=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
  if git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
    who=$(git log -1 --format=%an MERGE_HEAD)
    printf '{"decision":"block","reason":"%s changed the same lines as you in: %s. Both versions are now in the file between conflict markers. Combine them so that BOTH changes survive, remove the markers, then stop. Tell the user in one sentence what you combined."}\n' "$who" "$files"
  fi
  exit 0
fi
if git push -q origin HEAD:draft >/dev/null 2>&1; then
  if [ -s "$pending" ]; then
    list=$(sort -u "$pending")
    sha=$(git rev-parse --short HEAD)
    curl -fsS --max-time 3 -X POST -H "Authorization: Bearer $T" --data-urlencode "files=$list" --data-urlencode "sha=$sha" "$U/api/hook/saved" >/dev/null 2>&1 && rm -f "$pending"
  fi
fi
exit 0
AS_EOF
chmod +x .agentslack/hooks/prompt.sh .agentslack/hooks/before-edit.sh .agentslack/hooks/stop.sh

HOOKS='{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.agentslack/hooks/prompt.sh"}]}],"PreToolUse":[{"matcher":"Edit|Write","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.agentslack/hooks/before-edit.sh"}]}],"Stop":[{"hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.agentslack/hooks/stop.sh"}]}]}}'
HOOKS_NOTE=""
if [ ! -e .claude/settings.json ]; then
  echo "$HOOKS" > .claude/settings.json
  echo '.claude/settings.json' >> .git/info/exclude
elif grep -q 'agentslack/hooks' .claude/settings.json; then
  :
elif [ ! -e .claude/settings.local.json ]; then
  echo "$HOOKS" > .claude/settings.local.json
elif grep -q 'agentslack/hooks' .claude/settings.local.json; then
  :
else
  HOOKS_NOTE="Could not add the hooks: .claude/settings.json and .claude/settings.local.json already exist. Add the hooks from .agentslack/hooks.json by hand."
  echo "$HOOKS" > .agentslack/hooks.json
fi

git fetch -q origin 2>/dev/null
if git ls-remote --exit-code --heads origin draft >/dev/null 2>&1; then
  if git show-ref --verify --quiet refs/heads/draft; then
    git checkout -q draft 2>/dev/null || fail "could not switch to the draft branch. Save or discard your changes and run this again."
    git pull -q --no-rebase --no-edit origin draft >/dev/null 2>&1
  else
    git checkout -q -b draft --track origin/draft 2>/dev/null || fail "could not switch to the draft branch. Save or discard your changes and run this again."
  fi
else
  git checkout -q -B draft 2>/dev/null || fail "could not create the draft branch."
  git push -q -u origin draft 2>/dev/null || fail "could not push the draft branch to origin."
fi

touch .gitignore
for pat in '.env' '.env.*'; do
  grep -qxF "$pat" .gitignore || echo "$pat" >> .gitignore
done

if [ -n "$(git status --porcelain .gitignore)" ]; then
  git add .gitignore
  git commit -q -m "Ignore .env files" >/dev/null 2>&1
  git push -q origin HEAD:draft >/dev/null 2>&1
fi

if [ -z "$AGENTSLACK_SKIP_MCP" ] && command -v claude >/dev/null 2>&1; then
  # Reconnecting: drop any older entry first, or the old address and key would stay.
  claude mcp remove agentslack >/dev/null 2>&1
  claude mcp add --transport http agentslack "$ORIGIN/api/mcp" --header "Authorization: Bearer $TOKEN" >/dev/null 2>&1
fi

curl -fsS --max-time 5 -X POST -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/connect" >/dev/null 2>&1

echo "Connected this folder to your team room."
echo "Your work now saves to the shared draft branch each time Claude finishes a turn."
if [ -n "$HOOKS_NOTE" ]; then echo "$HOOKS_NOTE"; else echo "Start Claude Code here as usual. You never need to run git."; fi
`;

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const base = host && proto ? `${proto.split(",")[0].trim()}://${host}` : origin;
  return new Response(SCRIPT.replace("__ORIGIN__", base.replace(/'/g, "")), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
