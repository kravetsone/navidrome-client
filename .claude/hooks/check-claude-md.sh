#!/usr/bin/env bash
# SessionStart hook: if structural files are newer than CLAUDE.md,
# inject a reminder for Claude to review and refresh it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLAUDE_MD="$ROOT/CLAUDE.md"

if [ ! -f "$CLAUDE_MD" ]; then
  exit 0
fi

watched=(
  "$ROOT/package.json"
  "$ROOT/electrobun.config.ts"
  "$ROOT/vite.config.ts"
  "$ROOT/tsconfig.json"
  "$ROOT/src/shared/rpc-schema.ts"
  "$ROOT/src/shared/persistence.ts"
  "$ROOT/src/shared/discord.ts"
  "$ROOT/src/bun/index.ts"
  "$ROOT/src/mainview/App.tsx"
  "$ROOT/src/mainview/main.tsx"
)

mtime() {
  if stat -f '%m' "$1" >/dev/null 2>&1; then
    stat -f '%m' "$1"
  else
    stat -c '%Y' "$1"
  fi
}

claude_mtime=$(mtime "$CLAUDE_MD")
newer=()

for f in "${watched[@]}"; do
  [ -f "$f" ] || continue
  m=$(mtime "$f")
  if [ "$m" -gt "$claude_mtime" ]; then
    newer+=("${f#$ROOT/}")
  fi
done

# Detect top-level feature/dir drift via git-tracked listing
features_now=$(find "$ROOT/src/mainview/features" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sed "s|$ROOT/||" | sort | tr '\n' ' ')
if ! grep -q "src/mainview/features/" "$CLAUDE_MD"; then
  newer+=("src/mainview/features/ (not documented)")
fi

if [ ${#newer[@]} -eq 0 ]; then
  exit 0
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "CLAUDE.md may be stale — the following tracked files are newer than it:\n$(printf '  - %s\n' "${newer[@]}")\nBefore answering, skim CLAUDE.md against reality and update it in the same commit as any structural change you make this session. Do NOT touch CLAUDE.md unless there is actual drift."
  }
}
EOF
