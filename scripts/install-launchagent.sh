#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT_DIR/scripts/com.cloudflared.xui.plist.template"
TARGET="$HOME/Library/LaunchAgents/com.cloudflared.xui.plist"

mkdir -p "$HOME/Library/LaunchAgents"
sed "s#__ROOT__#$ROOT_DIR#g" "$TEMPLATE" > "$TARGET"

echo "LaunchAgent written to $TARGET"
echo "Load with: launchctl bootstrap gui/$(id -u) $TARGET"
echo "Stop with: launchctl bootout gui/$(id -u) $TARGET"
