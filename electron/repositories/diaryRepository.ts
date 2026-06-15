import type Database from "better-sqlite3";
import type { Diary, GetDiaryListOptions } from "../../shared/diary.js";

/**
 * 数据库原始行结构。
 *
 * repository 层负责隔离 SQLite 的 snake_case 字段、0/1 布尔值和 JSON string，
 * service / IPC / renderer 都不需要知道这些存储细节。
 */
interface DiaryRow {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  date: string;
  tags: string | null;
  deleted: 0 | 1;
}

/**
 * repository 创建数据时使用的内部结构。
 *
 * id、时间戳、date 默认值都由 service 层生成，repository 只负责持久化。
 */
export interface CreateDiaryRecord {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  date: string;
  tags: string[] | null;
}

/**
 * repository 更新数据时使用的内部结构。
 *
 * 使用 undefined 表示“不更新该字段”；使用 null 表示“明确把 tags 清空为 NULL”。
 */
export interface UpdateDiaryRecord {
  id: string;
  title?: string;
  content?: string;
  date?: string;
  tags?: string[] | null;
  updatedAt: number;
}

/**
 * 日记 repository：只封装 SQL，不放业务规则。
 *
 * 这样后续如果需要把服务层拆成更多用例，或者在 repository 上增加 search、
 * tag 关联表、全文索引等能力，都可以保持调用方稳定。
 */
export class DiaryRepository {
  public constructor(private readonly db: Database.Database) {}

  /**
   * 新增日记。
   *
   * tags 在写入前序列化为 JSON string；为空时写 NULL，符合表结构要求。
   */
  public createDiary(record: CreateDiaryRecord): Diary {
    this.db
      .prepare(
        `
          INSERT INTO diaries (
            id,
            title,
            content,
            created_at,
            updated_at,
            date,
            tags,
            deleted
          )
          VALUES (
            @id,
            @title,
            @content,
            @createdAt,
            @updatedAt,
            @date,
            @tags,
            0
          )
        `,
      )
      .run({
        ...record,
        tags: serializeTags(record.tags),
      });

    const createdDiary = this.getDiaryById(record.id);
    if (!createdDiary) {
      throw new Error("Diary was created but could not be read back.");
    }

    return createdDiary;
  }

  /**
   * 更新日记。
   *
   * 这里使用白名单字段动态拼接 SET 片段。字段名全部来自代码内部常量，
   * 用户输入只通过 better-sqlite3 参数绑定传入，避免 SQL 注入。
   */
  public updateDiary(record: UpdateDiaryRecord): Diary | null {
    const sets: string[] = ["updated_at = @updatedAt"];
    const params: Record<string, unknown> = {
      id: record.id,
      updatedAt: record.updatedAt,
    };

    if (record.title !== undefined) {
      sets.push("title = @title");
      params.title = record.title;
    }

    if (record.content !== undefined) {
      sets.push("content = @content");
      params.content = record.content;
    }

    if (record.date !== undefined) {
      sets.push("date = @date");
      params.date = record.date;
    }

    if (record.tags !== undefined) {
      sets.push("tags = @tags");
      params.tags = serializeTags(record.tags);
    }

    const result = this.db
      .prepare(
        `
          UPDATE diaries
          SET ${sets.join(", ")}
          WHERE id = @id
            AND deleted = 0
        `,
      )
      .run(params);

    if (result.changes === 0) {
      return null;
    }

    return this.getDiaryById(record.id);
  }

  /**
   * 软删除日记。
   *
   * 不物理删除数据，只把 deleted 置为 1，并刷新 updated_at，方便后续实现回收站、
   * 同步冲突处理或恢复能力。
   */
  public deleteDiary(id: string, updatedAt: number): boolean {
    const result = this.db
      .prepare(
        `
          UPDATE diaries
          SET deleted = 1,
              updated_at = @updatedAt
          WHERE id = @id
            AND deleted = 0
        `,
      )
      .run({ id, updatedAt });

    return result.changes > 0;
  }

  /**
   * 按 id 查询单条日记。
   *
   * 默认不返回软删除数据；如果后续要做回收站，可以通过 includeDeleted 开关复用。
   */
  public getDiaryById(id: string, includeDeleted = false): Diary | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            content,
            created_at,
            updated_at,
            date,
            tags,
            deleted
          FROM diaries
          WHERE id = @id
            ${includeDeleted ? "" : "AND deleted = 0"}
          LIMIT 1
        `,
      )
      .get({ id }) as DiaryRow | undefined;

    return row ? mapDiaryRow(row) : null;
  }

  /**
   * 查询日记列表。
   *
   * 默认行为满足需求：过滤 deleted = 0，并按 updated_at DESC 排序。
   * limit / offset 做了边界收敛，避免 renderer 传入异常数字导致一次性读取过多数据。
   */
  public getDiaryList(options: GetDiaryListOptions = {}): Diary[] {
    const limit = clampInteger(options.limit ?? 50, 1, 200);
    const offset = clampInteger(options.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const where: string[] = [];
    const params: Record<string, unknown> = { limit, offset };

    if (!options.includeDeleted) {
      where.push("deleted = 0");
    }

    if (options.date) {
      where.push("date = @date");
      params.date = options.date;
    }

    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            content,
            created_at,
            updated_at,
            date,
            tags,
            deleted
          FROM diaries
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY updated_at DESC
          LIMIT @limit
          OFFSET @offset
        `,
      )
      .all(params) as DiaryRow[];

    return rows.map(mapDiaryRow);
  }
}

/**
 * 将 tags 数组序列化为数据库中的 JSON string。
 */
function serializeTags(tags: string[] | null): string | null {
  return tags === null ? null : JSON.stringify(tags);
}

/**
 * 将数据库行转换为渲染层可用的 Diary。
 *
 * 如果历史数据中出现非法 tags JSON，这里返回 null，避免单条脏数据导致整个列表
 * 查询失败。新写入的数据仍然由 service 层保证 tags 为 string[] | null。
 */
function mapDiaryRow(row: DiaryRow): Diary {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    date: row.date,
    tags: parseTags(row.tags),
    deleted: row.deleted === 1,
  };
}

/**
 * 解析数据库中的 tags JSON string。
 */
function parseTags(rawTags: string | null): string[] | null {
  if (!rawTags) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawTags) as unknown;
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * 将分页数字收敛到安全范围。
 */
function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  const integer = Math.trunc(value);
  return Math.min(Math.max(integer, min), max);
}
