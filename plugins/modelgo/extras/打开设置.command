#!/bin/sh
# Double-click to open the ModelGo settings page in your browser: paste your key
# there and tick the models you want. Nothing is typed in this window.
cd "$(dirname "$0")/.." || exit 1
NODE="$(command -v node 2>/dev/null)"
[ -z "$NODE" ] && [ -x "$HOME/.workbuddy/binaries/node/versions/current/bin/node" ] && NODE="$HOME/.workbuddy/binaries/node/versions/current/bin/node"
if [ -z "$NODE" ]; then
  echo "找不到 Node。请先打开一次 WorkBuddy，或安装 Node 20 以上版本。"
  echo "Node was not found. Open WorkBuddy once, or install Node 20 or newer."
  printf "按回车键关闭 / Press Enter to close. "
  read -r _
else
  "$NODE" scripts/cli.mjs ui >/dev/null
  echo "设置页面已在浏览器中打开，这个窗口可以关闭。"
  echo "The settings page is open in your browser. You can close this window."
fi
