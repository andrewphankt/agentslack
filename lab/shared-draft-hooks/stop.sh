#!/bin/bash
# Stop: save this turn to the shared draft. Nobody types a git command.
cd "$CLAUDE_PROJECT_DIR" || exit 0; echo "hook $(basename $0) $(basename $CLAUDE_PROJECT_DIR)" >> "$CLAUDE_PROJECT_DIR/../room/hooks.log"
me=$(basename "$CLAUDE_PROJECT_DIR")
log="$CLAUDE_PROJECT_DIR/../room/sync.log"
if grep -rlE '^(<<<<<<<|>>>>>>>) ' . --exclude-dir=.git --exclude-dir=.claude >/dev/null 2>&1; then
  echo '{"decision":"block","reason":"Conflict markers are still in the files. Finish combining both versions, remove every marker, then stop."}'; exit 0
fi
git add -A
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  git commit -q --no-edit
elif ! git diff --cached --quiet; then
  git commit -q -m "$me: saved turn"
fi
if ! git pull -q --no-rebase --no-edit origin draft >/dev/null 2>&1; then
  files=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
  who=$(git log -1 --format=%an MERGE_HEAD)
  echo "$me: CONFLICT in $files with $who" >> "$log"
  printf '{"decision":"block","reason":"%s changed the same lines as you in: %s. Both versions are now in the file between conflict markers. Combine them so that BOTH changes survive, remove the markers, then stop. Tell the user in one sentence what you combined."}\n' "$who" "$files"
  exit 0
fi
git push -q origin HEAD:draft 2>>"$log" && echo "$me: pushed $(git rev-parse --short HEAD)" >> "$log"
exit 0
