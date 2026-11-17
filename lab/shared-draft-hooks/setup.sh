#!/bin/bash
set -e
L=$1; cd "$L"
rm -rf origin.git seed alice bob room; mkdir room
git init -q --bare origin.git
git init -q seed; cd seed; git checkout -q -b draft
cat > index.html <<'H'
<!doctype html>
<html>
<head><title>Tea Shop</title></head>
<body>
  <h1>Welcome to the Tea Shop</h1>
  <p class="tagline">Fresh leaves, every week.</p>
  <ul id="menu">
    <li>Green tea</li>
    <li>Black tea</li>
  </ul>
  <footer>Open 9 to 5</footer>
</body>
</html>
H
echo ".claude/" > .gitignore
git add -A; git -c user.name=Seed -c user.email=s@x commit -q -m "start"; git push -q ../origin.git draft
cd ..
for p in alice bob; do
  git clone -q -b draft origin.git $p
  N=$(python3 -c "print('$p'.capitalize())")
  git -C $p config user.name "$N"; git -C $p config user.email "$p@x"
  mkdir -p $p/.claude
  cat > $p/.claude/settings.json <<J
{"hooks":{
 "UserPromptSubmit":[{"hooks":[{"type":"command","command":"$L/bin/prompt.sh"}]}],
 "PreToolUse":[{"matcher":"Edit|Write","hooks":[{"type":"command","command":"python3 $L/bin/guard.py"}]}],
 "Stop":[{"hooks":[{"type":"command","command":"$L/bin/stop.sh"}]}]
}}
J
done
echo ready
