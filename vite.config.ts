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

    // 👉 Electron 推荐关掉这个
    strictPort: false,

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