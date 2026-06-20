import type Database from "better-sqlite3";
import type { Diary, GetDiaryListOptions } from "../../shared/diary.js";

/**
 * 数据库原始行结构。
 *
 * repository 层负责隔离 SQLite 的 snake_case 字段和 JSON 文本字段，
 * service / IPC / renderer 都不需要知道这些存储细节。
 */
interface DiaryRow {
  id: string;
  title: string;
  filepath: string;
  diary_date: string;
  created_at: number;
  updated_at: number;
  mood: string | null;
  tags: string;
  deleted: 0 | 1;
}

/**
 * repository 创建数据时使用的内部结构。
 */
export interface CreateDiaryRecord {
  id: string;
  title: string;
  filepath: string;
  diaryDate: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  mood?: string;
}

/**
 * repository 更新数据时使用的内部结构。
 *
 * tags 是日记自身的业务数据；undefined 表示不更新，空数组表示清空。
 */
export interface UpdateDiaryRecord {
  id: string;
  title?: string;
  diaryDate?: string;
  tags?: string[];
  mood?: string | null;
  updatedAt: number;
}

/**
 * 日记 repository：只封装 SQL，不放业务规则。
 */
export class DiaryRepository {
  public constructor(private readonly db: Database.Database) {}

  /**
   * 新增日记，tags 直接写入 diaries.tags JSON 字段。
   */
  public createDiary(record: CreateDiaryRecord): Diary {
    this.db
      .prepare(
        `
          INSERT INTO diaries (
            id,
            title,
            filepath,
            diary_date,
            created_at,
            updated_at,
            mood,
            tags,
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
            @tags,
            0
          )
        `,
      )
      .run({
        ...record,
        tags: stringifyTags(record.tags),
        mood: record.mood ?? null,
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
   * SET 字段来自代码白名单，用户输入只通过参数绑定传入。
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

    if (record.diaryDate !== undefined) {
      sets.push("diary_date = @diaryDate");
      params.diaryDate = record.diaryDate;
    }

    if (record.mood !== undefined) {
      sets.push("mood = @mood");
      params.mood = record.mood;
    }

    if (record.tags !== undefined) {
      sets.push("tags = @tags");
      params.tags = stringifyTags(record.tags);
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

    return result.changes > 0 ? this.getDiaryById(record.id) : null;
  }

  /**
   * 软删除日记。
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
   */
  public getDiaryById(id: string, includeDeleted = false): Diary | null {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            title,
            filepath,
            diary_date,
            created_at,
            updated_at,
            mood,
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
   */
  public getDiaryList(options: GetDiaryListOptions = {}): Diary[] {
    const limit = clampInteger(options.limit ?? 50, 1, 200);
    const offset = clampInteger(options.offset ?? 0, 0, Number.MAX_SAFE_INTEGER);
    const where: string[] = [];
    const params: Record<string, unknown> = { limit, offset };

    if (!options.includeDeleted) {
      where.push("d.deleted = 0");
    }

    if (options.diaryDate) {
      where.push("d.diary_date = @diaryDate");
      params.diaryDate = options.diaryDate;
    }

    if (options.tagId) {
      where.push(
        `
          EXISTS (
            SELECT 1
            FROM json_each(d.tags)
            WHERE value = @tagName
          )
        `,
      );
      params.tagName = options.tagId;
    }

    const rows = this.db
      .prepare(
        `
          SELECT
            d.id,
            d.title,
            d.filepath,
            d.diary_date,
            d.created_at,
            d.updated_at,
            d.mood,
            d.tags,
            d.deleted
          FROM diaries d
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY created_at DESC, updated_at DESC
          LIMIT @limit
          OFFSET @offset
        `,
      )
      .all(params) as DiaryRow[];

    return rows.map((row) => mapDiaryRow(row));
  }
}

function mapDiaryRow(row: DiaryRow): Diary {
  return {
    id: row.id,
    title: row.title,
    filepath: row.filepath,
    diaryDate: row.diary_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: parseStoredTags(row.tags),
    mood: row.mood ?? undefined,
    deleted: row.deleted === 1,
  };
}

function stringifyTags(tags: string[]): string {
  /*
   * SQLite 只存纯 JSON 文本，业务上的去重和 trim 由 service 层完成。
   */
  return JSON.stringify(tags);
}

function parseStoredTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    return [];
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
