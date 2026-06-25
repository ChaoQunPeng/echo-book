import type Database from "better-sqlite3";
import fs from "node:fs";
import { getDatabase, getNotesPath } from "./connection.js";

const DB_VERSION = "5";

/**
 * 初始化 SQLite schema。
 *
 * 开发阶段不保留旧 schema 数据；如果发现表结构不是当前版本，直接重建相关表。
 */
export function initializeDatabase(db?: Database.Database): void {
  const targetDb = db ?? getDatabase();

  if (!db) {
    ensureStorageDirectories();
  }

  targetDb.pragma("trusted_schema = ON");
  resetIncompatibleSchema(targetDb);
  createCurrentSchema(targetDb);
  initializeSettings(targetDb);
}

function ensureStorageDirectories(): void {
  /*
   * notes 是 Markdown 文件根目录，启动时确保它存在。
   */
  fs.mkdirSync(getNotesPath(), { recursive: true });
}

function resetIncompatibleSchema(db: Database.Database): void {
  /*
   * 开发阶段只保留当前 schema 需要的表，多余表不做数据保留。
   */
  dropUnexpectedTables(db);

  if (
    hasTable(db, "diaries") &&
    !hasExactColumns(db, "diaries", [
      "id",
      "title",
      "filepath",
      "diary_date",
      "created_at",
      "updated_at",
      "mood",
      "weather",
      "tags",
      "deleted",
    ])
  ) {
    dropTableIfExists(db, "diaries");
  }

  if (hasTable(db, "tags") && !hasExactColumns(db, "tags", ["name", "color", "created_at"])) {
    dropTableIfExists(db, "tags");
  }
}

function dropUnexpectedTables(db: Database.Database): void {
  const rows = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
      `,
    )
    .all() as Array<{ name: string }>;

  for (const row of rows) {
    if (!isCurrentSchemaTable(row.name)) {
      dropTableIfExists(db, row.name);
    }
  }
}

function createCurrentSchema(db: Database.Database): void {
  resetIncompatibleFtsSchema(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS diaries (
      id TEXT PRIMARY KEY,

      title TEXT NOT NULL,

      filepath TEXT NOT NULL UNIQUE,

      diary_date TEXT NOT NULL,

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      mood TEXT,
      weather TEXT,

      tags TEXT NOT NULL DEFAULT '[]',

      deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY,
      color TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_diary_date
      ON diaries(diary_date);

    CREATE INDEX IF NOT EXISTS idx_created_at
      ON diaries(created_at);

    CREATE INDEX IF NOT EXISTS idx_updated_at
      ON diaries(updated_at);

    CREATE INDEX IF NOT EXISTS idx_deleted
      ON diaries(deleted);
  `);

  createDiaryFtsSchema(db);
}

function createDiaryFtsSchema(db: Database.Database): void {
  /*
   * diary_fts 是从 Markdown 派生出来的搜索缓存，不是用户资产。
   * 这里用 trigram tokenizer 支持中文连续文本的全文检索。
   */
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS diary_fts USING fts5(
      title,
      content,
      tokenize = 'trigram'
    );
  `);

  recreateDiaryFtsTriggers(db);
}

function recreateDiaryFtsTriggers(db: Database.Database): void {
  /*
   * triggers 只负责 FTS 行生命周期和标题同步；正文来自 Markdown，
   * 由 service 在写文件成功后写入索引，避免 SQLite 变成正文数据源。
   */
  db.exec(`
    DROP TRIGGER IF EXISTS diaries_ai;
    DROP TRIGGER IF EXISTS diaries_au;
    DROP TRIGGER IF EXISTS diaries_ad;

    CREATE TRIGGER diaries_ai AFTER INSERT ON diaries BEGIN
      INSERT INTO diary_fts(rowid, title, content)
      VALUES (new.rowid, new.title, '');
    END;

    CREATE TRIGGER diaries_au AFTER UPDATE OF title, deleted ON diaries BEGIN
      UPDATE diary_fts
      SET title = new.title
      WHERE rowid = old.rowid
        AND new.deleted = 0;

      INSERT INTO diary_fts(rowid, title, content)
      SELECT new.rowid, new.title, ''
      WHERE new.deleted = 0
        AND NOT EXISTS (
          SELECT 1
          FROM diary_fts
          WHERE rowid = new.rowid
        );

      DELETE FROM diary_fts
      WHERE rowid = old.rowid
        AND new.deleted = 1;
    END;

    CREATE TRIGGER diaries_ad AFTER DELETE ON diaries BEGIN
      DELETE FROM diary_fts WHERE rowid = old.rowid;
    END;
  `);
}

function resetIncompatibleFtsSchema(db: Database.Database): void {
  if (!hasTable(db, "diary_fts")) {
    return;
  }

  if (!hasExactColumns(db, "diary_fts", ["title", "content"]) || !hasExpectedDiaryFtsSql(db)) {
    dropTableIfExists(db, "diary_fts");
  }
}

function initializeSettings(db: Database.Database): void {
  db.prepare(
    `
      INSERT INTO settings (key, value)
      VALUES ('db_version', @version)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
  ).run({ version: DB_VERSION });
}

function dropTableIfExists(db: Database.Database, tableName: string): void {
  db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)};`);
}

function hasTable(db: Database.Database, tableName: string): boolean {
  const table = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = @tableName
        LIMIT 1
      `,
    )
    .get({ tableName }) as { name: string } | undefined;

  return Boolean(table);
}

function isCurrentSchemaTable(tableName: string): boolean {
  const currentTables = new Set(["diaries", "tags", "settings", "diary_fts"]);

  /*
   * FTS5 会为虚拟表生成 shadow tables，不能被开发期清理逻辑误删。
   */
  return currentTables.has(tableName) || tableName.startsWith("diary_fts_");
}

function hasExpectedDiaryFtsSql(db: Database.Database): boolean {
  const row = db
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'diary_fts'
        LIMIT 1
      `,
    )
    .get() as { sql: string | null } | undefined;

  const sql = row?.sql?.toLowerCase() ?? "";

  return sql.includes("using fts5") && sql.includes("tokenize = 'trigram'");
}

function hasExactColumns(db: Database.Database, tableName: string, expectedColumns: string[]): boolean {
  const columnNames = getColumnNames(db, tableName);

  return columnNames.size === expectedColumns.length && expectedColumns.every((columnName) => columnNames.has(columnName));
}

function getColumnNames(db: Database.Database, tableName: string): Set<string> {
  /*
   * PRAGMA table_info 返回当前表列，用于开发期判断是否需要重建旧表。
   */
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>;

  return new Set(columns.map((column) => column.name));
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
