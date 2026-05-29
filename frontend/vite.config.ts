import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// 与 Nginx 子路径 /image_gpt/ 一致（上传 dist 内容到 /docker/nginx/html/image_gpt/）
const base = process.env.VITE_BASE || "/image_gpt/";

export default defineConfig({
  base,
  plugins: [
    vue({
      template: {
        transformAssetUrls: {
          includeAbsolute: false,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      [`${base.replace(/\/$/, "")}/api`]: {
        target: "http://127.0.0.1:5050",
        changeOrigin: true,
        rewrite: (path) => path.replace(new RegExp(`^${base.replace(/\/$/, "")}`), ""),
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
