# Nginx（Docker）

## 你的实际结构

容器内是**镜像默认**主配置：

```nginx
include /etc/nginx/conf.d/*.conf;
```

宿主机挂载：

```text
/docker/nginx/conf.d  →  /etc/nginx/conf.d
```

因此**要用 `conf.d/game.conf`**，不要指望改 `/docker/nginx/conf/nginx.conf`（除非你也把它挂到 `/etc/nginx/nginx.conf`）。

## 部署（只需一个 game.conf）

```bash
# 1. 复制站点配置
cp deploy/nginx/conf.d/game.conf /docker/nginx/conf.d/game.conf

# 2. conf.d 里只能有一个 .conf
cd /docker/nginx/conf.d
mv default.conf default.conf.bak 2>/dev/null
mv game.conf.bak game.conf 2>/dev/null   # 若之前误改名为 bak
ls *.conf   # 应只有 game.conf

# 3. 测试
docker exec nginx nginx -t
docker exec nginx nginx -s reload
```

## 为何之前 curl 没反应

把 `conf.d/*.conf` 全改成 `.bak` 后，主配置仍会 `include conf.d`，但**没有任何 server**，80 端口等于空配置。

## 目录

| 路径 | 说明 |
|------|------|
| `/docker/nginx/conf.d/game.conf` | 唯一站点（游戏 + 绘境） |
| `/docker/nginx/html/`（宿主机）→ `/usr/share/nginx/html/`（容器） | 静态；`game.conf` 里 `root` 写容器路径 |

## 访问

- `http://39.105.53.245/` — 主站静态（`/docker/nginx/html/index.html`，不反代 3000）
- `http://39.105.53.245/image_gpt/` — 绘境静态
- `http://39.105.53.245/image_gpt/api/health` — 绘境 API → `172.17.0.1:5050`

Nginx 容器为 `--network host` 时，把 `game.conf` 里 `172.17.0.1` 改为 `127.0.0.1`。

## 验证

```bash
docker exec nginx nginx -T | grep "listen 80"
curl --max-time 5 http://39.105.53.245/image_gpt/api/health
```
