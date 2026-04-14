#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".cloudflared.pid" ]]; then
  echo "No .cloudflared.pid found"
  exit 0
fi

PID="$(cat .cloudflared.pid)"
kill "$PID" 2>/dev/null || true
rm -f .cloudflared.pid
echo "cloudflared stopped"
