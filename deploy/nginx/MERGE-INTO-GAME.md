# 与已有 game.conf 合并（路径：/docker/nginx）

宿主机**没有** `/etc/nginx` 是正常的——那是容器内路径。你只维护：

| 宿主机 | 容器内（挂载一致时） |
|--------|----------------------|
| `/docker/nginx/nginx.conf` | `/docker/nginx/nginx.conf` 或挂到 `/etc/nginx/nginx.conf` |
| `/docker/nginx/conf/*.conf` | `/docker/nginx/conf/*.conf` |
| `/docker/nginx/html/` | `/docker/nginx/html/` |

## 0. 确认容器怎么挂载的

```bash
docker inspect nginx --format '{{json .Mounts}}' | python3 -m json.tool
# 或
docker exec nginx ls -la /docker/nginx/conf
docker exec nginx cat /docker/nginx/nginx.conf
```

主配置里应有类似：

```nginx
include /docker/nginx/conf/*.conf;
```

若没有，请用项目里的 `nginx.conf.docker.example` 作为 `/docker/nginx/nginx.conf`，并挂载到容器 `/etc/nginx/nginx.conf`。

## 1. 找出「两个 default_server」（报错根源）

```bash
docker exec nginx grep -rn "default_server" /etc/nginx/conf.d/
```

常见情况：`game.conf` 和 **`default.conf`** 都写了 `listen 80 default_server`。

处理：只保留一个，其余改名禁用：

```bash
docker exec nginx ls /etc/nginx/conf.d/
# 在宿主机对应目录执行，例如：
mv /docker/nginx/conf/default.conf /docker/nginx/conf/default.conf.bak
mv /docker/nginx/conf/80-main-and-gpt-image-tool.conf /docker/nginx/conf/80-main-and-gpt-image-tool.conf.bak
```

**你的 game.conf 内容可以保留**，只需在上面步骤后再加绘境 include（见 `game.conf.example`）。

### 仍报 duplicate default server on game.conf:8

说明 **除了 game.conf 外还有别的 `.conf` 带 `default_server`**（常见：`default.conf`）。在宿主机执行：

```bash
grep -rn 'default_server' /docker/nginx/conf/
# 或
docker exec nginx grep -rn 'default_server' /etc/nginx/conf.d/
```

**整个目录里只能保留一处 `default_server`**。建议全部 `.bak` 掉，只留 `game.conf`：

```bash
cd /docker/nginx/conf   # 按你实际目录
for f in default.conf 80-main-and-gpt-image-tool.conf; do
  [ -f "$f" ] && mv -v "$f" "$f.bak"
done
ls -la *.conf
docker exec nginx nginx -t
```

或把 `game.conf` 第 8 行改成 `listen 80;`（去掉 `default_server`），并确保 `default.conf` 已禁用。

## 2. conf 目录里保留

- `gpt-image-tool-upstream.conf`（upstream，被 `*.conf` 自动加载）
- `gpt-image-tool-locations.inc`（只有 location，**不会**被 `*.conf` 加载，要在 game.conf 里 include）

## 3. 编辑 game.conf（宿主机上改）

路径用 **容器里能访问到的路径**（与挂载一致，一般是 `/docker/nginx/...`）：

```nginx
server {
    listen 80 default_server;
    root /docker/nginx/html;
    index index.html;

    # 在 location / 之前
    include /docker/nginx/conf/gpt-image-tool-locations.inc;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**不要写** `include /etc/nginx/conf.d/...`（除非你挂载到了 `/etc/nginx/conf.d`）。

## 4. 测试

```bash
docker exec nginx nginx -t
docker exec nginx nginx -s reload
docker exec nginx nginx -T | grep image_gpt/api
```

## 5. 验证

```bash
curl -s http://39.105.53.245/image_gpt/api/health
```
