#!/bin/zsh
set -euo pipefail

TARGET="$HOME/Library/LaunchAgents/com.cloudflared.xui.plist"
rm -f "$TARGET"
echo "Removed $TARGET"
