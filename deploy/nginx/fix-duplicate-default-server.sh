#!/usr/bin/env bash
# 在服务器上执行，找出重复的 default_server
set -euo pipefail

echo "=== conf.d 文件列表 ==="
docker exec nginx ls -la /etc/nginx/conf.d/ 2>/dev/null || ls -la /docker/nginx/conf/

echo ""
echo "=== 含 default_server 或 listen 80 的行 ==="
docker exec nginx grep -rnE 'default_server|listen\s+80' /etc/nginx/conf.d/ 2>/dev/null \
  || grep -rnE 'default_server|listen\s+80' /docker/nginx/conf/

echo ""
echo "=== 含 server { 的文件 ==="
docker exec nginx grep -rln 'server\s*{' /etc/nginx/conf.d/ 2>/dev/null \
  || grep -rln 'server\s*{' /docker/nginx/conf/
