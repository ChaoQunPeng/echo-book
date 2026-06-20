import type Database from "better-sqlite3";
import fs from "node:fs";
import { getDatabase, getNotesPath } from "./connection.js";

const DB_VERSION = "3";

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
  const currentTables = new Set(["diaries", "tags", "settings"]);
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
    if (!currentTables.has(row.name)) {
      dropTableIfExists(db, row.name);
    }
  }
}

function createCurrentSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diaries (
      id TEXT PRIMARY KEY,

      title TEXT NOT NULL,

      filepath TEXT NOT NULL UNIQUE,

      diary_date TEXT NOT NULL,

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      mood TEXT,

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
