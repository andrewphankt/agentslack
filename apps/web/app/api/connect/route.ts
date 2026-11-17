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
 * The hooks are small stubs; what they run is served by ./core and can change without a reconnect.
 * Written with String.raw and no backticks or dollar-brace so the shell text stays literal.
 */
const SCRIPT = String.raw`#!/bin/sh
# Mesh connect: wires this clone to the team room.
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

# What gets installed here is tiny and never changes: each file hands over to run.sh, and
# run.sh runs the room's current script (core.sh), fetching a fresh copy at the start of a turn.
# So the room can be improved without anyone connecting again.
cat > .agentslack/run.sh <<'AS_EOF'
#!/bin/sh
# Mesh: runs the room's current script for this project.
# To stop automatic updates, create the file .agentslack/no-update
D="$CLAUDE_PROJECT_DIR"
[ -n "$D" ] || D=$(git rev-parse --show-toplevel 2>/dev/null)
cd "$D" 2>/dev/null || exit 0
CLAUDE_PROJECT_DIR="$PWD"; export CLAUDE_PROJECT_DIR
case "$1" in
  prompt|start)
    U=$(git config --local agentslack.url 2>/dev/null)
    if [ -n "$U" ] && [ ! -f .agentslack/no-update ]; then
      # Only a complete, valid script from this project's own room replaces the current one.
      if curl -fsS --max-time 3 "$U/api/connect/core" -o .agentslack/core.new 2>/dev/null \
        && [ "$(tail -n 1 .agentslack/core.new)" = "# mesh-core-end" ] \
        && sh -n .agentslack/core.new 2>/dev/null; then
        mv .agentslack/core.new .agentslack/core.sh
      fi
      rm -f .agentslack/core.new
    fi
    ;;
esac
[ -f .agentslack/core.sh ] || exit 0
exec sh .agentslack/core.sh "$@"
AS_EOF
for h in prompt before-edit stop; do
  printf '#!/bin/sh\nexec sh "$CLAUDE_PROJECT_DIR/.agentslack/run.sh" %s\n' "$h" > ".agentslack/hooks/$h.sh"
done
printf '#!/bin/sh\nexec sh "$(git rev-parse --show-toplevel 2>/dev/null)/.agentslack/run.sh" "$@"\n' > .agentslack/room.sh
chmod +x .agentslack/run.sh .agentslack/room.sh .agentslack/hooks/prompt.sh .agentslack/hooks/before-edit.sh .agentslack/hooks/stop.sh
curl -fsS --max-time 10 "$ORIGIN/api/connect/core" -o .agentslack/core.sh || fail "could not reach the room. Check your connection and run this again."


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

KIND="$2"

RULES_FILE=""
case "$KIND" in
  codex) RULES_FILE="AGENTS.md" ;;
  gemini) RULES_FILE="GEMINI.md" ;;
esac
if [ -n "$RULES_FILE" ] && ! grep -q 'mesh:start' "$RULES_FILE" 2>/dev/null; then
  # A rules file we create stays out of the team's commits; one that already exists is theirs.
  [ -e "$RULES_FILE" ] || echo "$RULES_FILE" >> .git/info/exclude
  cat >> "$RULES_FILE" <<'AS_EOF'

<!-- mesh:start -->
## Team room (Mesh)

This project is shared with a team through Mesh. Everyone works on one shared "draft" branch. Follow these three rules on every request, without being asked:

1. Before you start, run: sh .agentslack/room.sh start
   It brings in teammates' latest work. Read what it prints; it may include a request from the room.
2. Before you change a file, run: sh .agentslack/room.sh check <path>
   If it prints STOP, do not change that file. Tell the user what it says.
3. When you finish, run: sh .agentslack/room.sh save
   It saves your work to the shared draft. If it prints CONFLICT, combine both versions so that both changes survive, remove the markers, and run it again.

Never commit, push or switch branches yourself, and never work on the main branch. Publishing to the public site happens in the room, not here.
<!-- mesh:end -->
AS_EOF
fi
if [ "$KIND" = "gemini" ] && [ -z "$AGENTSLACK_SKIP_MCP" ] && command -v gemini >/dev/null 2>&1; then
  gemini mcp remove agentslack >/dev/null 2>&1
  gemini mcp add --transport http --header "Authorization: Bearer $TOKEN" agentslack "$ORIGIN/api/mcp" >/dev/null 2>&1
fi

if [ -z "$RULES_FILE" ] && [ -z "$AGENTSLACK_SKIP_MCP" ] && command -v claude >/dev/null 2>&1; then
  # Reconnecting: drop any older entry first, or the old address and key would stay.
  claude mcp remove agentslack >/dev/null 2>&1
  claude mcp add --transport http agentslack "$ORIGIN/api/mcp" --header "Authorization: Bearer $TOKEN" >/dev/null 2>&1
fi

curl -fsS --max-time 5 -X POST -H "Authorization: Bearer $TOKEN" "$ORIGIN/api/connect" >/dev/null 2>&1

echo "Connected this folder to your team room."
if [ -n "$RULES_FILE" ]; then
  echo "The team rules are in $RULES_FILE. Your agent brings in the team's work, checks before editing, and saves to the shared draft by itself."
  echo "Start your agent again in this folder so it reads the rules."
  exit 0
fi
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
