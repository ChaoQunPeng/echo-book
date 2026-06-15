import { randomUUID } from "node:crypto";
import type {
  CreateDiaryInput,
  Diary,
  GetDiaryListOptions,
  UpdateDiaryInput,
} from "../../shared/diary.js";
import type { DiaryRepository } from "../repositories/diaryRepository.js";

/**
 * 日记 service：承载轻量业务规则和输入校验。
 *
 * 当前业务还比较简单，但 service 层先保留下来很重要：
 * - repository 只写 SQL，不关心默认日期、UUID、字段校验
 * - IPC 只做进程边界适配，不混入业务判断
 * - 后续增加全文搜索、标签归一化、自动摘要时可以自然放在这里
 */
export class DiaryService {
  public constructor(private readonly diaryRepository: DiaryRepository) {}

  /**
   * 创建日记。
   *
   * id 使用 crypto.randomUUID() 生成，created_at / updated_at 使用毫秒时间戳。
   */
  public createDiary(input: CreateDiaryInput): Diary {
    const now = Date.now();
    const title = normalizeTitle(input.title);
    const content = normalizeContent(input.content);
    const date = input.date ? normalizeDate(input.date) : getTodayDateString();

    return this.diaryRepository.createDiary({
      id: randomUUID(),
      title,
      content,
      createdAt: now,
      updatedAt: now,
      date,
      tags: normalizeTags(input.tags),
    });
  }

  /**
   * 更新日记。
   *
   * 如果 id 不存在或日记已被软删除，返回 null 时会在 service 层转换成明确错误，
   * 方便 renderer 用 try/catch 呈现失败状态。
   */
  public updateDiary(input: UpdateDiaryInput): Diary {
    const id = normalizeId(input.id);
    const updatedDiary = this.diaryRepository.updateDiary({
      id,
      title: input.title === undefined ? undefined : normalizeTitle(input.title),
      content: input.content === undefined ? undefined : normalizeContent(input.content),
      date: input.date === undefined ? undefined : normalizeDate(input.date),
      tags: input.tags === undefined ? undefined : normalizeTags(input.tags),
      updatedAt: Date.now(),
    });

    if (!updatedDiary) {
      throw new Error(`Diary not found: ${id}`);
    }

    return updatedDiary;
  }

  /**
   * 软删除日记。
   */
  public deleteDiary(id: string): { success: boolean } {
    return {
      success: this.diaryRepository.deleteDiary(normalizeId(id), Date.now()),
    };
  }

  /**
   * 按 id 查询单条日记。
   */
  public getDiaryById(id: string): Diary | null {
    return this.diaryRepository.getDiaryById(normalizeId(id));
  }

  /**
   * 查询日记列表。
   */
  public getDiaryList(options: GetDiaryListOptions = {}): Diary[] {
    return this.diaryRepository.getDiaryList({
      ...options,
      date: options.date === undefined ? undefined : normalizeDate(options.date),
    });
  }
}

/**
 * 标准化标题。
 *
 * 标题用于列表和窗口标题等场景，首尾空白通常没有业务意义，因此会 trim。
 */
function normalizeTitle(value: string): string {
  if (typeof value !== "string") {
    throw new Error("title must be a string.");
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error("title cannot be empty.");
  }

  return normalized;
}

/**
 * 标准化正文。
 *
 * 正文可能是 Markdown，首尾换行和缩进都可能是用户内容的一部分，所以这里只检查
 * trim 后不是空白文本，但返回原始字符串，避免无意修改用户写下的内容。
 */
function normalizeContent(value: string): string {
  if (typeof value !== "string") {
    throw new Error("content must be a string.");
  }

  if (!value.trim()) {
    throw new Error("content cannot be empty.");
  }

  return value;
}

/**
 * 标准化 id。
 */
function normalizeId(id: string): string {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("id cannot be empty.");
  }

  return id.trim();
}

/**
 * 校验 YYYY-MM-DD 日期格式。
 *
 * 这里先只做格式校验，不强行校验真实日历日期，避免时区转换带来额外复杂度。
 * 如果后续做日历视图，可以在 service 层进一步收紧规则。
 */
function normalizeDate(date: string): string {
  const normalized = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("date must use YYYY-MM-DD format.");
  }

  return normalized;
}

/**
 * 标准化 tags。
 *
 * - undefined / null：写入 NULL
 * - string[]：去掉空标签、去重
 */
function normalizeTags(tags: string[] | null | undefined): string[] | null {
  if (tags === undefined || tags === null) {
    return null;
  }

  if (!Array.isArray(tags)) {
    throw new Error("tags must be an array of strings or null.");
  }

  const normalizedTags = tags
    .map((tag) => {
      if (typeof tag !== "string") {
        throw new Error("tags must be an array of strings or null.");
      }

      return tag.trim();
    })
    .filter(Boolean);

  return Array.from(new Set(normalizedTags));
}

/**
 * 生成本机本地日期字符串。
 *
 * SQLite 存储 date TEXT，不存 Date 对象，这样 renderer 做日历分组时无需处理
 * UTC 日期偏移问题。
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
