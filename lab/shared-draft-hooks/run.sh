#!/bin/bash
# run.sh <person> [-c] "<prompt>"  : one agent turn for that person
L=/tmp/as-lab-da8ef414
p=$1; shift
cont=""; if [ "$1" = "-c" ]; then cont="-c"; shift; fi
cd "$L/$p" && claude -p $cont "$1" --model haiku --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Glob,Grep" --strict-mcp-config --mcp-config '{"mcpServers":{}}' 2>&1 | grep -v "sign-in can end"
