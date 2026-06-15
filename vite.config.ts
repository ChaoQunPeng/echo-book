import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { codeInspectorPlugin } from "code-inspector-plugin";

export default defineConfig({
  plugins: [
    tailwindcss(),
    codeInspectorPlugin({
      bundler: "vite",
    }),
    react(),
  ],

  clearScreen: false,

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

    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
