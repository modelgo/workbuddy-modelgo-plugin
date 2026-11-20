#!/bin/sh
# Double-click to save your ModelGo key. The key is typed here, in this window,
# and is never shown. It is checked with ModelGo and then kept on this computer.
cd "$(dirname "$0")/.." || exit 1
NODE="$(command -v node 2>/dev/null)"
[ -z "$NODE" ] && [ -x "$HOME/.workbuddy/binaries/node/versions/current/bin/node" ] && NODE="$HOME/.workbuddy/binaries/node/versions/current/bin/node"
if [ -z "$NODE" ]; then
  echo "找不到 Node。请先打开一次 WorkBuddy，或安装 Node 20 以上版本。"
  echo "Node was not found. Open WorkBuddy once, or install Node 20 or newer."
else
  "$NODE" scripts/cli.mjs set-key
fi
echo
printf "按回车键关闭 / Press Enter to close. "
read -r _
