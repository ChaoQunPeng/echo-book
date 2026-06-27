import Database from "better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite 数据库文件名。
 *
 * 按需求固定为 echoBook.db，实际路径放在 Electron 的 userData/database 目录中。
 * 这样数据库、Markdown 文件和以后可能增加的附件目录都能在同一个应用数据根目录下
 * 分区管理，用户做备份时也更容易直接识别数据库文件夹。
 */
const DATABASE_FILE_NAME = "echoBook.db";
const DATABASE_DIRECTORY_NAME = "database";
const NOTES_DIRECTORY_NAME = "echoBookNotes";

/**
 * 自定义 echoBookNotes 路径在 settings 表中的 key。
 */
const CUSTOM_NOTES_PATH_KEY = "custom_echo_book_notes_path";

/**
 * 主进程内的数据库单例。
 *
 * better-sqlite3 是同步 API，但它运行在 Electron main process 中；
 * renderer 侧只通过 IPC 间接调用，因此不会把 Node.js / SQLite 能力泄漏给页面。
 */
let database: Database.Database | null = null;

/**
 * 自定义 echoBookNotes 目录的内存缓存。
 *
 * 启动时从 settings 表读入，后续 set/reset 操作同步更新 settings 表 + 内存。
 * 这样 getNotesPath() 不需要依赖 getDatabase()，避免循环依赖。
 */
let customNotesPath: string | null = null;

/**
 * 获取应用自己的数据根目录。
 *
 * Electron 的 app.getPath("userData") 会根据系统和应用名返回专属数据目录：
 * macOS 通常类似 ~/Library/Application Support/<app-name>。
 */
export function getStorageRootPath(): string {
  return app.getPath("userData");
}

/**
 * 获取数据库目录的绝对路径。
 *
 * 数据库相关文件会包含主库 echoBook.db，以及 SQLite WAL 模式下可能出现的
 * echoBook.db-wal / echoBook.db-shm。统一放进 database 文件夹后，用户备份时不容易
 * 漏掉这些伴随文件。
 */
export function getDatabaseDirectoryPath(): string {
  return path.join(getStorageRootPath(), DATABASE_DIRECTORY_NAME);
}

/**
 * 获取默认的日记 Markdown 文件目录路径（userData/echoBookNotes）。
 */
export function getDefaultNotesPath(): string {
  return path.join(getStorageRootPath(), NOTES_DIRECTORY_NAME);
}

/**
 * 获取当前日记目录的标准目录名。
 */
export function getNotesDirectoryName(): string {
  return NOTES_DIRECTORY_NAME;
}

/**
 * 获取当前日记 Markdown 文件目录的绝对路径。
 *
 * 如果用户设置了自定义目录，返回自定义路径；否则返回默认的 userData/echoBookNotes。
 */
export function getNotesPath(): string {
  if (customNotesPath) {
    return customNotesPath;
  }

  return getDefaultNotesPath();
}

/**
 * 获取数据库文件的绝对路径。
 */
export function getDatabasePath(): string {
  return path.join(getDatabaseDirectoryPath(), DATABASE_FILE_NAME);
}

/**
 * 从 settings 表读取自定义 echoBookNotes 路径并缓存到内存。
 *
 * 在数据库初始化完成后调用，确保 getNotesPath() 能拿到用户自定义路径。
 */
export function loadCustomNotesPathFromDb(): void {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = @key")
    .get({ key: CUSTOM_NOTES_PATH_KEY }) as { value: string } | undefined;

  customNotesPath = row?.value ?? null;
}

/**
 * 获取当前自定义 echoBookNotes 路径（可能为 null）。
 */
export function getCustomNotesPathFromMemory(): string | null {
  return customNotesPath;
}

/**
 * 设置自定义 echoBookNotes 路径并持久化到 settings 表。
 */
export function setCustomNotesPath(newPath: string): void {
  const db = getDatabase();
  db.prepare(
    `
      INSERT INTO settings (key, value)
      VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
  ).run({ key: CUSTOM_NOTES_PATH_KEY, value: newPath });

  customNotesPath = newPath;
}

/**
 * 重置自定义 echoBookNotes 路径为默认值（从 settings 表中删除）。
 */
export function resetCustomNotesPath(): void {
  const db = getDatabase();
  db.prepare("DELETE FROM settings WHERE key = @key").run({ key: CUSTOM_NOTES_PATH_KEY });

  customNotesPath = null;
}

/**
 * 获取 SQLite 连接单例。
 *
 * 这里会确保 userData 目录存在，并设置基础 PRAGMA：
 * - journal_mode=WAL：提升桌面应用读写并发和崩溃恢复表现
 * - trusted_schema=ON：允许应用自有 trigger 维护 FTS5 虚拟表索引
 */
export function getDatabase(): Database.Database {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  database = new Database(databasePath);
  database.pragma("trusted_schema = ON");
  database.pragma("journal_mode = WAL");

  return database;
}

/**
 * 主动把 WAL 中尚未合并的数据刷回主数据库文件。
 *
 * 导出备份前调用这个函数，可以让 zip 里的 echoBook.db 尽量自包含；同时我们仍然会把
 * database 文件夹整体打包，保留 SQLite 当前可能生成的 WAL/SHM 伴随文件。
 */
export function checkpointDatabase(): void {
  getDatabase().pragma("wal_checkpoint(FULL)");
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
