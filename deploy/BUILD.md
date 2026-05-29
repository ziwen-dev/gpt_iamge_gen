# Linux 可执行文件打包

## 在 Linux 服务器上直接构建

```bash
cd gpt-image-tool
chmod +x build_linux.sh
./build_linux.sh
```

产物：`dist/gpt-image-tool-server`

**glibc 兼容性**：Docker 构建使用 `python:3.12-bullseye`（glibc 2.31），适用于多数 CentOS 7+ / Ubuntu 20.04+ 服务器。若仍报 `GLIBC_x.xx not found`，在服务器执行 `ldd --version` 查看版本；极旧系统（如 CentOS 7 的 2.17）需升级 OS 或在同版本系统上执行 `./build_linux.sh` 本地打包。

## 在 Windows 上用 Docker 构建

需先启动 **Docker Desktop**，然后在项目根目录：

```powershell
.\build_linux_docker.ps1
```

## 部署运行

将以下文件放在同一目录（例如 `/opt/gpt-image-tool/`）：

- `gpt-image-tool-server`
- `.env`（从 `env.example` 复制并填写 `GPT_IMAGE_API_KEY`）

```bash
chmod +x gpt-image-tool-server
PORT=5050 ./gpt-image-tool-server
```

首次运行会在可执行文件旁创建 `output/` 目录。

配合 Nginx 时：

1. 构建 Vue 前端：`cd frontend && npm ci && npm run build`
2. 将 `frontend/dist/` 放到服务器 `www/` 目录
3. Nginx 静态托管 + `/api` 反代到 `127.0.0.1:5050`

详见 `deploy/nginx/README.md` 与 `frontend/README.md`。
