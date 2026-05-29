# 绘境 · GPT Image Tool

文生图 / 图生图本地控制台：**Vue 3 前端** + **Flask API 后端**。

## 快速开始（开发）

```bash
# 后端
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # Windows
cp env.example .env                           # 填写 GPT_IMAGE_API_KEY

python app.py                                 # http://127.0.0.1:5050 仅 API

# 前端（另开终端）
cd frontend
npm install
npm run dev                                   # http://127.0.0.1:5173
```

## 生产部署

1. `cd frontend && npm ci && npm run build`
2. 将 `frontend/dist/` 同步到服务器 `www/`（见 `scripts/sync_frontend_dist.sh`）
3. Gunicorn 启动 `app:app`，Nginx 静态站点 + `/api` 反代

详见 [deploy/nginx/README.md](deploy/nginx/README.md)、[frontend/README.md](frontend/README.md)。

## 目录

| 路径 | 说明 |
|------|------|
| `app.py` | Flask API（`/api/*`） |
| `frontend/` | Vue 3 + Vite 前端 |
| `deploy/nginx/` | Nginx 配置示例 |
| `deploy/www/` | 前端构建产物同步目标（本地） |
| `output/` | 生成图片与记录（运行时） |
