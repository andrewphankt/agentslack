/**
 * The script every connected project runs at the start of a turn, before an edit and at the end
 * of a turn. Projects fetch it fresh each turn, so changing it here reaches everyone without a
 * reconnect. POSIX sh only. Written with String.raw and no backticks or dollar-brace.
 * It must end with the line "# mesh-core-end": the stub refuses a copy without it.
 */
export const ROOM_CORE = String.raw`#!/bin/sh
# Mesh core: the room's current script. Fetched fresh at the start of each turn by .agentslack/run.sh
do_prompt() (
#!/bin/sh
# UserPromptSubmit: pull the team's latest, tell the agent, record intent.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
T=$(git config --local agentslack.token 2>/dev/null)
U=$(git config --local agentslack.url 2>/dev/null)
[ -n "$T" ] && [ -n "$U" ] || exit 0
code=$(curl -sS --max-time 3 -o .agentslack/prompt.out -w '%{http_code}' -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data-binary @- "$U/api/hook/prompt" 2>/dev/null)
if [ "$code" = "401" ]; then
  # This agent was disconnected in the room: forget the key and drop the room's tools,
  # so nothing stale is left behind and connecting again starts clean.
  rm -f .agentslack/prompt.out
  git config --local --unset agentslack.token >/dev/null 2>&1
  command -v claude >/dev/null 2>&1 && claude mcp remove agentslack >/dev/null 2>&1
  echo "ROOM: this agent was disconnected from the team room. Nothing is being saved or shared now. To connect again, press + next to Agents in the room and paste the new message here."
  exit 0
fi
[ "$code" = "200" ] && cat .agentslack/prompt.out 2>/dev/null
rm -f .agentslack/prompt.out
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
)
do_before_edit() (
#!/bin/sh
# PreToolUse on Edit|Write: ask the room who else is in this file.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
T=$(git config --local agentslack.token 2>/dev/null)
U=$(git config --local agentslack.url 2>/dev/null)
[ -n "$T" ] && [ -n "$U" ] || exit 0
curl -fsS --max-time 3 -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" --data-binary @- "$U/api/hook/before-edit" 2>/dev/null
exit 0
)
do_stop() (
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
)
case "$1" in
  prompt) do_prompt ;;
  before-edit) do_before_edit ;;
  stop) do_stop ;;
  start)
    printf '{"prompt":""}' | do_prompt
    echo "Ready."
    ;;
  check)
    [ -n "$2" ] || { echo "OK"; exit 0; }
    case "$2" in /*) f="$2" ;; *) f="$PWD/$2" ;; esac
    out=$(printf '{"tool_input":{"file_path":"%s"},"cwd":"%s"}' "$f" "$PWD" | do_before_edit)
    reason=$(printf '%s' "$out" | sed -n 's/.*"permissionDecisionReason":"\([^"]*\)".*/\1/p')
    if [ -n "$reason" ]; then echo "STOP: $reason"; else echo "OK"; fi
    ;;
  save)
    out=$(do_stop)
    reason=$(printf '%s' "$out" | sed -n 's/.*"reason":"\([^"]*\)".*/\1/p')
    if [ -n "$reason" ]; then echo "CONFLICT: $reason Then run this again."; else echo "Saved to the team's shared draft."; fi
    ;;
  *) echo "use: room.sh start | check <file> | save" ;;
esac
exit 0
# mesh-core-end
`;
