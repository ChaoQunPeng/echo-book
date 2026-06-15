import type Database from "better-sqlite3";
import { getDatabase } from "./connection.js";

/**
 * 初始化 SQLite schema。
 *
 * 表结构严格按照需求定义：
 * - id TEXT PRIMARY KEY
 * - title / content / created_at / updated_at / date 为必填字段
 * - tags 为 JSON string，可为空
 * - deleted 使用 0/1 表示软删除状态
 */
export function initializeDatabase(db: Database.Database = getDatabase()): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diaries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      date TEXT NOT NULL,
      tags TEXT,
      deleted INTEGER DEFAULT 0
    );
  `);

  /**
   * 常用查询索引。
   *
   * getDiaryList 默认按 updated_at DESC 查询未删除数据，所以增加组合索引；
   * date 索引用于日历视图、按天筛选等后续常见能力。
   */
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_diaries_deleted_updated_at
      ON diaries (deleted, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_diaries_date_deleted
      ON diaries (date, deleted);
  `);
}
