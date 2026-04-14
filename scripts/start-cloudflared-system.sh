#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".cloudflared.token" ]]; then
  echo "Missing .cloudflared.token"
  exit 1
fi

if [[ ! -f ".cloudflared-config.yml" ]]; then
  echo "Missing .cloudflared-config.yml"
  exit 1
fi

nohup ./bin/cloudflared \
  tunnel \
  --config .cloudflared-config.yml \
  --protocol http2 \
  --metrics 127.0.0.1:49312 \
  --no-autoupdate \
  --loglevel info \
  run \
  --token-file .cloudflared.token \
  > .cloudflared.log 2>&1 &

echo $! > .cloudflared.pid
echo "cloudflared started with PID $(cat .cloudflared.pid)"
