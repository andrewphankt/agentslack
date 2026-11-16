#!/bin/bash
# UserPromptSubmit: get teammates' latest work, tell the agent what changed
cd "$CLAUDE_PROJECT_DIR" || exit 0; echo "hook $(basename $0) $(basename $CLAUDE_PROJECT_DIR)" >> "$CLAUDE_PROJECT_DIR/../room/hooks.log"
[ -f "$CLAUDE_PROJECT_DIR/../room/no-pull" ] && exit 0
before=$(git rev-parse HEAD)
git pull -q --rebase --autostash origin draft >/dev/null 2>&1
after=$(git rev-parse HEAD)
if [ "$before" != "$after" ]; then
  echo "ROOM UPDATE: teammates changed the project since your last turn. Your files are already up to date."
  git log --format='- %an: %s' "$before..$after"
  git diff --stat "$before..$after" | tail -5
fi
exit 0
