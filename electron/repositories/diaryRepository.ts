import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Diary, GetDiaryListOptions } from "../../shared/diary.js";

/**
 * 数据库原始行结构。
 *
 * repository 层负责隔离 SQLite 的 snake_case 字段和 0/1 布尔值，
 * service / IPC / renderer 都不需要知道这些存储细节。
 */
interface DiaryRow {
  id: string;
  title: string;
  content: string | null;
  filepath: string;
  diary_date: string;
  created_at: number;
  updated_at: number;
  mood: string | null;
  deleted: 0 | 1;
}

interface TagRow {
  id: string;
  name: string;
}

/**
 * repository 创建数据时使用的内部结构。
 *
 * id、时间戳、diaryDate、filepath 默认值都由 service 层生成，repository 只负责持久化。
 */
export interface CreateDiaryRecord {
  id: string;
  title: string;
  content: string;
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
 * 使用 undefined 表示“不更新该字段”；tags 传入空数组表示清空关系。
 */
export interface UpdateDiaryRecord {
  id: string;
  title?: string;
  content?: string;
  diaryDate?: string;
  tags?: string[];
  mood?: string | null;
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
   * tags 通过 diary_tags 关系表写入，不在 diaries 表中存 JSON。
   */
  public createDiary(record: CreateDiaryRecord): Diary {
    const create = this.db.transaction(() => {
      this.db
        .prepare(
          `
            INSERT INTO diaries (
              id,
              title,
              content,
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
              @content,
              @filepath,
              @diaryDate,
              @createdAt,
              @updatedAt,
              @mood,
              0
            )
          `,
        )
        .run({
          ...record,
          mood: record.mood ?? null,
        });

      this.replaceDiaryTags(record.id, record.tags);
    });

    create();

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

    if (record.diaryDate !== undefined) {
      sets.push("diary_date = @diaryDate");
      params.diaryDate = record.diaryDate;
    }

    if (record.mood !== undefined) {
      sets.push("mood = @mood");
      params.mood = record.mood;
    }

    const update = this.db.transaction(() => {
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
        return false;
      }

      if (record.tags !== undefined) {
        this.replaceDiaryTags(record.id, record.tags);
      }

      return true;
    });

    if (!update()) {
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
            filepath,
            diary_date,
            created_at,
            updated_at,
            mood,
            deleted
          FROM diaries
          WHERE id = @id
            ${includeDeleted ? "" : "AND deleted = 0"}
          LIMIT 1
        `,
      )
      .get({ id }) as DiaryRow | undefined;

    return row ? mapDiaryRow(row, this.getTagsForDiary(row.id)) : null;
  }

  /**
   * 查询日记列表。
   *
   * 默认行为满足需求：过滤 deleted = 0，并按 diary_date DESC 排序。
   * limit / offset 做了边界收敛，避免 renderer 传入异常数字导致一次性读取过多数据。
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
            FROM diary_tags dt
            WHERE dt.diary_id = d.id
              AND dt.tag_id = @tagId
          )
        `,
      );
      params.tagId = options.tagId;
    }

    const rows = this.db
      .prepare(
        `
          SELECT
            d.id,
            d.title,
            d.content,
            d.filepath,
            d.diary_date,
            d.created_at,
            d.updated_at,
            d.mood,
            d.deleted
          FROM diaries d
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY diary_date DESC, updated_at DESC
          LIMIT @limit
          OFFSET @offset
        `,
      )
      .all(params) as DiaryRow[];

    return rows.map((row) => mapDiaryRow(row, this.getTagsForDiary(row.id)));
  }

  private replaceDiaryTags(diaryId: string, tags: string[]): void {
    this.db.prepare("DELETE FROM diary_tags WHERE diary_id = @diaryId").run({ diaryId });

    for (const tagName of tags) {
      const tagId = this.getOrCreateTagId(tagName);
      this.db
        .prepare(
          `
            INSERT OR IGNORE INTO diary_tags (diary_id, tag_id)
            VALUES (@diaryId, @tagId)
          `,
        )
        .run({ diaryId, tagId });
    }
  }

  private getOrCreateTagId(name: string): string {
    const existingTag = this.db
      .prepare(
        `
          SELECT id
          FROM tags
          WHERE name = @name
          LIMIT 1
        `,
      )
      .get({ name }) as Pick<TagRow, "id"> | undefined;

    if (existingTag) {
      return existingTag.id;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `
          INSERT INTO tags (id, name)
          VALUES (@id, @name)
        `,
      )
      .run({ id, name });

    return id;
  }

  private getTagsForDiary(diaryId: string): string[] {
    const rows = this.db
      .prepare(
        `
          SELECT t.id, t.name
          FROM tags t
          JOIN diary_tags dt
            ON t.id = dt.tag_id
          WHERE dt.diary_id = @diaryId
          ORDER BY t.name COLLATE NOCASE ASC
        `,
      )
      .all({ diaryId }) as TagRow[];

    return rows.map((row) => row.name);
  }
}

/**
 * 将数据库行转换为渲染层可用的 Diary。
 */
function mapDiaryRow(row: DiaryRow, tags: string[]): Diary {
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? "",
    filepath: row.filepath,
    diaryDate: row.diary_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
    mood: row.mood ?? undefined,
    deleted: row.deleted === 1,
  };
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
