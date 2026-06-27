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
 * 开发环境专用的 Electron userData 目录名。
 *
 * Electron 默认会按应用名生成 userData，例如 macOS 上通常是：
 * ~/Library/Application Support/EchoBook。
 *
 * 如果开发环境和正式包都使用默认目录，它们会共用同一个 SQLite 数据库和 notes
 * 正文目录，调试数据、测试迁移、临时删除等操作就可能污染正式数据。所以开发模式
 * 主动改到 EchoBook-dev，正式包继续保留 EchoBook，不影响已经安装用户的数据位置。
 */
const DEVELOPMENT_USER_DATA_DIRECTORY_NAME = "EchoBook-dev";

/**
 * 开发环境直接从仓库 build 目录读取应用图标。
 * 正式包图标由 electron-builder.config.cjs 写入安装包，这里不重复处理。
 */
function getDevelopmentAppIconPath(): string | undefined {
  if (app.isPackaged) {
    return undefined;
  }

  const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
  return path.join(process.cwd(), "build", iconFileName);
}

/**
 * 在应用 ready 前固定开发环境的数据根目录。
 *
 * app.getPath("userData") 是数据库、Markdown 正文、设置页路径展示和备份导出的共同
 * 根路径；只要在这里统一改掉，后续所有存储能力都会自动隔离到开发目录。
 *
 * 这个配置必须尽量早执行，早于窗口创建、IPC 注册和数据库初始化，避免某个模块先读取
 * 默认 userData 后再切换路径，造成同一次启动里路径不一致。
 */
function configureEnvironmentStoragePath(): void {
  if (app.isPackaged) {
    return;
  }

  const developmentUserDataPath = path.join(app.getPath("appData"), DEVELOPMENT_USER_DATA_DIRECTORY_NAME);
  app.setPath("userData", developmentUserDataPath);
}

configureEnvironmentStoragePath();

/**
 * macOS 开发环境下 Dock 图标不看 BrowserWindow.icon，需要单独设置。
 */
function configureDevelopmentDockIcon(): void {
  const developmentIconPath = getDevelopmentAppIconPath();

  if (!developmentIconPath || process.platform !== "darwin") {
    return;
  }

  app.dock.setIcon(developmentIconPath);
}

/**
 * 创建主窗口。
 *
 * 安全策略：
 * - contextIsolation: true：renderer 与 preload 隔离
 * - nodeIntegration: false：renderer 不能直接访问 Node.js
 * - preload 只暴露受控的 diaryAPI，数据库操作必须走 IPC
 */
function createWindow(): void {
  const developmentIconPath = getDevelopmentAppIconPath();

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    ...(developmentIconPath ? { icon: developmentIconPath } : {}),
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
    /*
     * 开发阶段把 renderer 的 console 转发到启动终端。
     * 保存失败这类错误常发生在 renderer catch 中，只看主进程日志会漏掉关键信息。
     */
    win.webContents.on("console-message", (_event, level, message) => {
      console.log(`[renderer:${level}] ${message}`);
    });

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
    configureDevelopmentDockIcon();
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
