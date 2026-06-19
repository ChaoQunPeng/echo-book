import type Database from "better-sqlite3";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getDatabase, getNotesPath } from "./connection.js";

const DB_VERSION = "2";

/**
 * 初始化 SQLite schema。
 *
 * Markdown 文件是内容本体，SQLite 负责索引、查询和组织结构。
 * filepath 是数据库和文件系统之间的稳定桥梁，创建后不随标题、标签或 diaryDate
 * 的修改而变化。
 */
export function initializeDatabase(db: Database.Database = getDatabase()): void {
  ensureStorageDirectories();
  migrateLegacySchemaIfNeeded(db);
  createCurrentSchema(db);
  initializeSettings(db);
}

function ensureStorageDirectories(): void {
  /*
   * notes 是 Markdown 文件的根目录。
   * 即使当前还没有日记，也在启动时创建出来，方便用户按设置路径直接找到它。
   */
  fs.mkdirSync(getNotesPath(), { recursive: true });
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

      deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS diary_tags (
      diary_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,

      PRIMARY KEY (diary_id, tag_id),

      FOREIGN KEY (diary_id)
        REFERENCES diaries(id)
        ON DELETE CASCADE,

      FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON DELETE CASCADE
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

    CREATE INDEX IF NOT EXISTS idx_diary_tags_tag_id
      ON diary_tags(tag_id);
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

function migrateLegacySchemaIfNeeded(db: Database.Database): void {
  const diariesTable = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = 'diaries'
        LIMIT 1
      `,
    )
    .get() as { name: string } | undefined;

  if (!diariesTable) {
    return;
  }

  const columns = db.prepare("PRAGMA table_info(diaries)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  const isCurrentMetadataSchema = columnNames.has("filepath") && columnNames.has("diary_date") && !columnNames.has("tags");

  if (isCurrentMetadataSchema) {
    return;
  }

  const legacyRows = db
    .prepare(
      `
        SELECT *
        FROM diaries
      `,
    )
    .all() as LegacyDiaryRow[];

  const legacyTableName = `diaries_legacy_${Date.now()}`;
  db.exec(`ALTER TABLE diaries RENAME TO ${legacyTableName};`);
  createCurrentSchema(db);

  const insertDiary = db.prepare(
    `
      INSERT INTO diaries (
        id,
        title,
        filepath,
        diary_date,
        created_at,
        updated_at,
        mood,
        deleted
      )
      VALUES (
        @id,
        @title,
        @filepath,
        @diaryDate,
        @createdAt,
        @updatedAt,
        @mood,
        @deleted
      )
    `,
  );
  const insertTag = db.prepare(
    `
      INSERT INTO tags (id, name)
      VALUES (@id, @name)
      ON CONFLICT(name) DO NOTHING
    `,
  );
  const getTagId = db.prepare("SELECT id FROM tags WHERE name = @name LIMIT 1");
  const insertDiaryTag = db.prepare(
    `
      INSERT OR IGNORE INTO diary_tags (diary_id, tag_id)
      VALUES (@diaryId, @tagId)
    `,
  );

  const migrate = db.transaction(() => {
    for (const row of legacyRows) {
      const createdAt = normalizeTimestamp(row.created_at);
      const id = normalizeText(row.id) || randomUUID();
      const filepath = normalizeText(row.filepath) || generateFilePath(createdAt, id);

      insertDiary.run({
        id,
        title: normalizeText(row.title) || "未命名日记",
        filepath,
        diaryDate:
          normalizeText(row.diary_date) ||
          normalizeText(row.date) ||
          getLocalDateString(createdAt),
        createdAt,
        updatedAt: normalizeTimestamp(row.updated_at, createdAt),
        mood: normalizeNullableText(row.mood),
        deleted: row.deleted === 1 ? 1 : 0,
      });

      for (const tagName of parseLegacyTags(row.tags)) {
        const tagId = randomUUID();
        insertTag.run({ id: tagId, name: tagName });

        const tag = getTagId.get({ name: tagName }) as { id: string } | undefined;
        if (tag) {
          insertDiaryTag.run({ diaryId: id, tagId: tag.id });
        }
      }
    }
  });

  migrate();
  db.exec(`DROP TABLE ${legacyTableName};`);
}

interface LegacyDiaryRow {
  id?: unknown;
  title?: unknown;
  filepath?: unknown;
  diary_date?: unknown;
  date?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  mood?: unknown;
  tags?: unknown;
  deleted?: unknown;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeTimestamp(value: unknown, fallback = Date.now()): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function parseLegacyTags(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

function generateFilePath(createdAt: number, id: string): string {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `notes/${year}/${month}/${id}.md`;
}

function getLocalDateString(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
