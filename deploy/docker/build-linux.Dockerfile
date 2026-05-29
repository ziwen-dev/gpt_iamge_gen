# 在 Windows/macOS 上交叉构建 Linux 可执行文件（需本机已安装 Docker）
# 用法（在项目根目录）：
#   docker build -f deploy/docker/build-linux.Dockerfile -t gpt-image-tool-build .
#   docker create --name gpt-image-tool-artifact gpt-image-tool-build
#   docker cp gpt-image-tool-artifact:/out/gpt-image-tool-server ./dist/
#   docker rm gpt-image-tool-artifact

# bookworm(glibc 2.36) 产物在旧系统上会报 GLIBC_2.35 not found；bullseye(2.31) 兼容更多 Linux 服务器
FROM python:3.12-bullseye

WORKDIR /src
COPY requirements.txt gpt-image-tool.spec app.py run_server.py build_linux.sh ./
RUN chmod +x build_linux.sh && ./build_linux.sh

RUN mkdir -p /out && cp dist/gpt-image-tool-server /out/
