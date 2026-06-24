import { createHash } from "node:crypto";
import { basename } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { codeInspectorPlugin } from "code-inspector-plugin";

function createDevScopedName(className: string, filename: string, css: string) {
  const fileName = basename(filename)
    .replace(/\.module\.\w+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const hash = createHash("sha256").update(`${filename}:${className}:${css}`).digest("base64url").slice(0, 5);

  // 开发环境保留文件名和原始类名，方便在浏览器 DevTools 中定位样式来源。
  return `${fileName}_${className}__${hash}`;
}

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === "development";

  return {
    // 生产包由 Electron 通过 file:// 加载，资源路径必须是相对路径。
    base: isDevelopment ? "/" : "./",

    plugins: [
      tailwindcss(),
      codeInspectorPlugin({
        bundler: "vite",
      }),
      react(),
    ],

    clearScreen: false,

    css: {
      modules: {
        generateScopedName: isDevelopment ? createDevScopedName : undefined,
      },
    },

    server: {
      port: 5173,

      // Electron 主进程会固定加载 http://localhost:5173。
      // 因此这里必须锁定端口；如果 5173 被占用，应直接失败并提示释放端口，
      // 而不是让 Vite 自动切到 5174 导致 Electron 仍然访问旧地址。
      strictPort: true,

      // 👉 Electron 用固定 localhost
      host: "localhost",

      hmr: {
        host: "localhost",
        port: 5173,
      },
    },
  };
});
