#!/usr/bin/env bash
# 将 frontend/dist 同步到 deploy/www
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/frontend/dist"
DST="$ROOT/deploy/www"
if [[ ! -d "$SRC" ]]; then
  echo "请先执行: cd frontend && npm run build" >&2
  exit 1
fi
mkdir -p "$DST"
rsync -a --delete "$SRC/" "$DST/"
echo "已同步到 $DST"
