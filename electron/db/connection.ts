import Database from "better-sqlite3";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite 数据库文件名。
 *
 * 按需求固定为 diaries.db，实际路径放在 Electron 的 userData/database 目录中。
 * 这样数据库、Markdown 文件和以后可能增加的附件目录都能在同一个应用数据根目录下
 * 分区管理，用户做备份时也更容易直接识别数据库文件夹。
 */
const DATABASE_FILE_NAME = "diaries.db";
const DATABASE_DIRECTORY_NAME = "database";
const NOTES_DIRECTORY_NAME = "notes";

/**
 * 主进程内的数据库单例。
 *
 * better-sqlite3 是同步 API，但它运行在 Electron main process 中；
 * renderer 侧只通过 IPC 间接调用，因此不会把 Node.js / SQLite 能力泄漏给页面。
 */
let database: Database.Database | null = null;

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
 * 数据库相关文件会包含主库 diaries.db，以及 SQLite WAL 模式下可能出现的
 * diaries.db-wal / diaries.db-shm。统一放进 database 文件夹后，用户备份时不容易
 * 漏掉这些伴随文件。
 */
export function getDatabaseDirectoryPath(): string {
  return path.join(getStorageRootPath(), DATABASE_DIRECTORY_NAME);
}

/**
 * 获取日记 Markdown 文件目录的绝对路径。
 *
 * notes 继续作为 userData 下的独立目录，和 database 并列，方便用户按文件夹备份或查看。
 */
export function getNotesPath(): string {
  return path.join(getStorageRootPath(), NOTES_DIRECTORY_NAME);
}

/**
 * 获取数据库文件的绝对路径。
 */
export function getDatabasePath(): string {
  return path.join(getDatabaseDirectoryPath(), DATABASE_FILE_NAME);
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
  migrateLegacyDatabaseFilesIfNeeded(databasePath);

  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return database;
}

/**
 * 主动把 WAL 中尚未合并的数据刷回主数据库文件。
 *
 * 导出备份前调用这个函数，可以让 zip 里的 diaries.db 尽量自包含；同时我们仍然会把
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

/**
 * 从旧版本的 userData/diaries.db 迁移到 userData/database/diaries.db。
 *
 * 这个迁移只在新位置还没有主数据库、旧位置存在主数据库时执行，避免覆盖用户已经在
 * database 文件夹中产生的新数据。SQLite 在 WAL 模式下通常会额外生成 -wal 和 -shm，
 * 所以这里把常见伴随文件一起搬迁，最大限度保留未 checkpoint 的事务状态。
 */
function migrateLegacyDatabaseFilesIfNeeded(databasePath: string): void {
  if (fs.existsSync(databasePath)) {
    return;
  }

  const legacyDatabasePath = path.join(getStorageRootPath(), DATABASE_FILE_NAME);
  if (!fs.existsSync(legacyDatabasePath)) {
    return;
  }

  const databaseDirectoryPath = path.dirname(databasePath);
  fs.mkdirSync(databaseDirectoryPath, { recursive: true });

  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const legacyPath = `${legacyDatabasePath}${suffix}`;
    const migratedPath = `${databasePath}${suffix}`;

    /*
     * 如果某个伴随文件目标位置已经存在，保守地留下旧文件，避免把两个不同时间点的
     * SQLite 文件混在一起。主数据库文件不存在是进入迁移的前提，因此核心数据会被搬走。
     */
    if (fs.existsSync(legacyPath) && !fs.existsSync(migratedPath)) {
      fs.renameSync(legacyPath, migratedPath);
    }
  }
}
