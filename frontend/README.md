# 绘境 · Vue 前端

基于 Vue 3 + Vite + TypeScript。生产环境由 Nginx 托管静态文件；开发时通过 Vite 代理访问本地 Python API。

## 开发

```bash
# 终端 1：后端 API（项目根目录）
python app.py
# 或: .venv/bin/gunicorn -w 2 -b 127.0.0.1:5050 'app:app'

# 终端 2：前端
cd frontend
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173/ ，`/api` 会代理到 `http://127.0.0.1:5050`。

## 生产构建

```bash
cd frontend
npm ci
npm run build
```

产物在 `frontend/dist/`。同步到部署目录：

```powershell
# Windows
..\scripts\sync_frontend_dist.ps1

# Linux
../scripts/sync_frontend_dist.sh
```

服务器上通常将 `deploy/www`（或 `dist` 内容）放到 `/opt/gpt-image-tool/www/`，Nginx 配置见 `deploy/nginx/`。

## 目录说明

| 路径 | 说明 |
|------|------|
| `src/App.vue` | 主界面模板（由原 `static/index.html` 迁移） |
| `src/studio-legacy.js` | 业务逻辑（逐步可拆为 composables） |
| `src/styles/app.css` | 全局样式 |
| `public/assets/` | 风格预览图等静态资源（构建时原样复制） |

将真实风格预览图放入 `public/assets/`（`xieshi.png`、`keji.png` 等）即可替换占位图。
