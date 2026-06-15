import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase } from "./db/connection.js";
import { registerDiaryIpcHandlers } from "./ipc/diaryIpc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
void app.whenReady().then(() => {
  registerDiaryIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
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
