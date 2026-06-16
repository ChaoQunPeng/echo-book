import { app, BrowserWindow } from "electron";
import path from "node:path";
import { closeDatabase } from "./db/connection.js";
import { registerDiaryIpcHandlers } from "./ipc/diaryIpc.js";
import { registerSettingsIpcHandlers } from "./ipc/settingsIpc.js";

/**
 * 编译后的 Electron main process 运行在 dist-electron/package.json 标记的
 * CommonJS 作用域中。
 *
 * 根项目仍然可以保持 "type": "module"，但 Electron 运行时对 CommonJS 主进程
 * 兼容性最好：TypeScript 会把上面的 `import { app } from "electron"` 编译成
 * `require("electron")`，从而拿到 Electron 注入的 app / BrowserWindow。
 */

/**
 * 创建主窗口。
 *
 * 安全策略：
 * - contextIsolation: true：renderer 与 preload 隔离
 * - nodeIntegration: false：renderer 不能直接访问 Node.js
 * - preload 只暴露受控的 diaryAPI，数据库操作必须走 IPC
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (!app.isPackaged) {
    void win.loadURL("http://localhost:5173");
  } else {
    void win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }
}

/**
 * Electron 启动入口。
 *
 * app ready 后再初始化数据库和 IPC，确保 app.getPath("userData") 可用。
 */
void app
  .whenReady()
  .then(() => {
    registerDiaryIpcHandlers();
    registerSettingsIpcHandlers();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error: unknown) => {
    /**
     * Electron ready 之后才初始化 SQLite 和 IPC；如果 better-sqlite3 这类 native
     * addon ABI 不匹配，错误会在这条 promise 链里抛出。显式 catch 可以避免
     * UnhandledPromiseRejectionWarning，并让进程用非 0 退出码告诉启动脚本失败。
     */
    console.error("Failed to start Electron main process:", error);
    app.quit();
    process.exitCode = 1;
  });

/**
 * macOS 通常在关闭所有窗口后仍保留应用进程；其他平台按桌面应用惯例退出。
 */
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * 应用退出前关闭 SQLite 连接。
 */
app.on("before-quit", () => {
  closeDatabase();
});
