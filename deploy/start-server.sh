#!/usr/bin/env bash
# 宿主机启动绘境后端（供 Docker Nginx 反代）
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="$(pwd)"
BIN="${GPT_IMAGE_SERVER:-$DIR/dist/gpt-image-tool-server}"
if [[ ! -x "$BIN" ]]; then
  BIN="./gpt-image-tool-server"
fi
export GPT_IMAGE_LISTEN=0.0.0.0
export PORT="${PORT:-5050}"
LOG="${GPT_IMAGE_LOG:-./gpt-image-tool.log}"
echo "[start] GPT_IMAGE_LISTEN=$GPT_IMAGE_LISTEN PORT=$PORT log=$LOG"
nohup "$BIN" >>"$LOG" 2>&1 &
echo "[start] pid=$! log=$LOG"
