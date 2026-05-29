#!/usr/bin/env bash
# 示例：Docker 启动 Nginx（宿主机配置 /docker/nginx/conf，静态 /docker/nginx/html）
# 按实际容器名、端口、是否已有容器自行修改。

set -euo pipefail

docker run -d --name nginx \
  --restart unless-stopped \
  -p 80:80 \
  -v /docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
  -v /docker/nginx/conf:/docker/nginx/conf:ro \
  -v /docker/nginx/html:/usr/share/nginx/html:ro \
  --add-host=host.docker.internal:host-gateway \
  nginx:alpine

echo "OK. 测试并重载："
echo "  docker exec nginx nginx -t"
echo "  docker exec nginx nginx -s reload"
