import Database from "better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite 数据库文件名。
 *
 * 按需求固定为 diaries.db，实际路径放在 Electron 的 userData 目录中。
 * 这样开发、打包、系统权限和多用户环境都会比放在项目目录更可靠。
 */
const DATABASE_FILE_NAME = "diaries.db";

/**
 * 主进程内的数据库单例。
 *
 * better-sqlite3 是同步 API，但它运行在 Electron main process 中；
 * renderer 侧只通过 IPC 间接调用，因此不会把 Node.js / SQLite 能力泄漏给页面。
 */
let database: Database.Database | null = null;

/**
 * 获取数据库文件的绝对路径。
 *
 * Electron 的 app.getPath("userData") 会根据系统和应用名返回专属数据目录：
 * macOS 通常类似 ~/Library/Application Support/<app-name>。
 */
export function getDatabasePath(): string {
  return path.join(app.getPath("userData"), DATABASE_FILE_NAME);
}

/**
 * 获取 SQLite 连接单例。
 *
 * 这里会确保 userData 目录存在，并设置基础 PRAGMA：
 * - journal_mode=WAL：提升桌面应用读写并发和崩溃恢复表现
 * - foreign_keys=ON：为后续扩展关联表预留一致性保障
 */
export function getDatabase(): Database.Database {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return database;
}

/**
 * 关闭数据库连接。
 *
 * Electron 退出时调用，避免 WAL 文件仍处于打开状态。这个函数做成幂等，
 * 方便后续测试或热重载场景重复调用。
 */
export function closeDatabase(): void {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}
