import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CreateDiaryInput,
  Diary,
  DiaryAsset,
  DiaryDetail,
  GetDiaryAssetInput,
  GetDiaryListOptions,
  SaveDiaryAssetInput,
  UpdateDiaryInput,
} from "../../shared/diary.js";
import { CLEARED_DIARY_TITLE_FALLBACK } from "../../shared/defaultDiary.js";
import { DEFAULT_MOOD } from "../../shared/moods.js";
import type { SyncMarkdownFilesResult } from "../../shared/settings.js";
import { formatWeather } from "../../shared/weather.js";
import { getNotesPath } from "../db/connection.js";
import type { DiaryRepository, DiarySearchIndexRecord } from "../repositories/diaryRepository.js";
import type { TagRepository } from "../repositories/tagRepository.js";
import { normalizeTagNames } from "./tagService.js";

interface DiaryMarkdownFile {
  markdown: string;
  frontMatter?: DiaryFrontMatter;
}

interface DiaryFrontMatter {
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  tags?: string[];
  mood?: string;
  weather?: string;
}

interface BuildDiaryMarkdownFileInput {
  title: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  mood?: string;
  weather?: string;
  markdown: string;
}

/**
 * 日记 service：承载轻量业务规则和输入校验。
 *
 * 当前业务还比较简单，但 service 层先保留下来很重要：
 * - repository 只写 SQL，不关心默认日期、UUID、字段校验
 * - IPC 只做进程边界适配，不混入业务判断
 * - 后续增加全文搜索、标签归一化、自动摘要时可以自然放在这里
 */
export class DiaryService {
  public constructor(
    private readonly diaryRepository: DiaryRepository,
    private readonly tagRepository: TagRepository,
  ) { }

  /**
   * 创建日记。
   *
   * id 使用 crypto.randomUUID() 生成，created_at / updated_at 使用毫秒时间戳。
   * Markdown 文件写在 getNotesPath() 下，SQLite 只保存相对于 echoBookNotes 目录的 filepath。
   */
  public createDiary(input: CreateDiaryInput): DiaryDetail {
    const now = Date.now();
    const id = randomUUID();
    const title = normalizeTitle(input.title);
    const markdown = normalizeMarkdown(input.markdown);
    /*
     * diaryDate 暂时不由界面填写，统一取 createdAt 的本地日期。
     * 这样数据库里的日期字段始终和创建时间保持一致。
     */
    const diaryDate = formatTimestampDate(now);
    const filepath = generateFilePath(now, id);
    const tags = normalizeTagNames(input.tags);
    const mood = input.mood === undefined ? DEFAULT_MOOD : normalizeMood(input.mood);
    const weather = input.weather === undefined ? undefined : normalizeWeather(input.weather);

    writeDiaryFile(
      filepath,
      buildDiaryMarkdownFile({
        title,
        createdAt: now,
        updatedAt: now,
        tags,
        mood,
        weather,
        markdown,
      }),
    );
    this.tagRepository.ensureTagsExist(tags);

    const diary = this.diaryRepository.createDiary({
      id,
      title,
      filepath,
      diaryDate,
      createdAt: now,
      updatedAt: now,
      tags,
      /*
       * 创建入口没有显式心情时，默认选中“平静”。
       */
      mood,
      weather,
    });

    this.diaryRepository.syncDiarySearchIndex({
      id: diary.id,
      title: diary.title,
      content: markdown,
    });

    return this.attachDiaryMarkdown(diary);
  }

  /**
   * 更新日记。
   *
   * 如果 id 不存在或日记已被软删除，返回 null 时会在 service 层转换成明确错误，
   * 方便 renderer 用 try/catch 呈现失败状态。
   */
  public updateDiary(input: UpdateDiaryInput): DiaryDetail {
    const id = normalizeId(input.id);
    const existingDiary = this.diaryRepository.getDiaryById(id);
    if (!existingDiary) {
      throw new Error(`Diary not found: ${id}`);
    }

    const markdown =
      input.markdown === undefined ? undefined : normalizeMarkdown(input.markdown);

    const tags = input.tags === undefined ? undefined : normalizeTagNames(input.tags);
    if (tags !== undefined) {
      this.tagRepository.ensureTagsExist(tags);
    }

    const title = input.title === undefined ? existingDiary.title : normalizeTitle(input.title);
    const moodUpdate =
      input.mood === undefined
        ? undefined
        : normalizeMoodUpdateValue(input.mood);
    const nextMood =
      input.mood === undefined || moodUpdate === undefined
        ? existingDiary.mood
        : moodUpdate ?? undefined;
    const weatherUpdate =
      input.weather === undefined
        ? undefined
        : normalizeWeatherUpdateValue(input.weather);
    const nextWeather =
      input.weather === undefined || weatherUpdate === undefined
        ? existingDiary.weather
        : weatherUpdate ?? undefined;
    const updatedAt = Date.now();
    const nextMarkdown =
      markdown === undefined
        ? readDiaryMarkdownFile(existingDiary.filepath).markdown
        : markdown;

    writeDiaryFile(
      existingDiary.filepath,
      buildDiaryMarkdownFile({
        title,
        createdAt: existingDiary.createdAt,
        updatedAt,
        tags: tags ?? existingDiary.tags ?? [],
        mood: nextMood,
        weather: nextWeather,
        markdown: nextMarkdown,
      }),
    );

    const updatedDiary = this.diaryRepository.updateDiary({
      id,
      title,
      /*
       * 更新旧日记时也按 createdAt 回填 diaryDate，避免历史入口传入不同日期。
       */
      diaryDate: formatTimestampDate(existingDiary.createdAt),
      tags,
      mood: input.mood === undefined ? undefined : moodUpdate,
      weather: input.weather === undefined ? undefined : weatherUpdate,
      updatedAt,
    });

    if (!updatedDiary) {
      throw new Error(`Diary not found: ${id}`);
    }

    this.diaryRepository.syncDiarySearchIndex({
      id: updatedDiary.id,
      title: updatedDiary.title,
      content: nextMarkdown,
    });

    return this.attachDiaryMarkdown(updatedDiary);
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
  public getDiaryById(id: string): DiaryDetail | null {
    const diary = this.diaryRepository.getDiaryById(normalizeId(id));
    return diary ? this.attachDiaryMarkdown(diary) : null;
  }

  /**
   * 查询日记列表。
   */
  public getDiaryList(options: GetDiaryListOptions = {}): Diary[] {
    return this.diaryRepository.getDiaryList({
      ...options,
      diaryDate:
        options.diaryDate === undefined
          ? undefined
          : normalizeDate(options.diaryDate, "diaryDate"),
      tagId: options.tagId === undefined ? undefined : normalizeId(options.tagId),
    });
  }

  /**
   * 使用 FTS 查询标题和 Markdown 正文。
   */
  public searchDiary(keyword: string): Diary[] {
    return this.diaryRepository.searchDiary(normalizeSearchKeyword(keyword));
  }

  /**
   * 从 Markdown 文件重建 FTS 缓存。
   *
   * 这条路径只读 Markdown，不写 Markdown，因此 FTS 损坏或被删除时可以安全恢复。
   */
  public rebuildDiarySearchIndex(): void {
    const records: DiarySearchIndexRecord[] = this.diaryRepository
      .getDiariesForSearchIndex()
      .map((diary) => ({
        id: diary.id,
        title: diary.title,
        content: readDiaryMarkdownFile(diary.filepath).markdown,
      }));

    this.diaryRepository.rebuildDiarySearchIndex(records);
  }

  /**
   * 扫描当前 echoBookNotes 目录，把外部放入的 Markdown 文件补写进 SQLite。
   */
  public syncMarkdownFilesToDatabase(): SyncMarkdownFilesResult {
    const notesPath = getNotesPath();
    fs.mkdirSync(notesPath, { recursive: true });

    const existingFilepaths = new Set(this.diaryRepository.getAllDiaryFilepaths());
    const markdownFiles = listMarkdownFiles(notesPath);
    let importedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const markdownFile of markdownFiles) {
      if (existingFilepaths.has(markdownFile.filepath)) {
        skippedCount += 1;
        continue;
      }

      try {
        const diary = this.importMarkdownFile(markdownFile.absolutePath, markdownFile.filepath);
        existingFilepaths.add(diary.filepath);
        importedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error("Failed to import markdown file:", markdownFile.filepath, error);
      }
    }

    /*
     * 文件丢失只作为提醒，不在扫描动作里自动删除或软删除日记。
     */
    const missingFileCount = this.diaryRepository
      .getAllDiaryFilepaths(false)
      .filter((filepath) => !fs.existsSync(resolveDiaryFilePath(filepath))).length;

    return {
      success: true,
      importedCount,
      skippedCount,
      failedCount,
      missingFileCount,
    };
  }

  /**
   * 保存日记图片资源。
   *
   * 所有图片都落在当前 Markdown 文件同级的 assets 目录，Markdown 中只保存相对路径。
   */
  public saveDiaryAsset(input: SaveDiaryAssetInput): DiaryAsset {
    const diary = this.diaryRepository.getDiaryById(normalizeId(input.diaryId));
    if (!diary) {
      throw new Error(`Diary not found: ${input.diaryId}`);
    }

    const mimeType = normalizeImageMimeType(input.mimeType);
    const extension = getImageExtension(input.fileName, mimeType);
    const fileName = `${Date.now()}_${randomUUID()}.${extension}`;
    const relativePath = `assets/${fileName}`;
    const absolutePath = resolveDiaryAssetPath(diary.filepath, relativePath);
    const data = Buffer.from(input.data);

    if (data.byteLength === 0) {
      throw new Error("image data cannot be empty.");
    }

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, data);

    return {
      relativePath,
      fileName,
      mimeType,
    };
  }

  /**
   * 读取日记图片资源并返回 data URL。
   *
   * renderer 不能直接访问本机文件系统，因此预览本地 assets 图片时通过这条受控链路读取。
   */
  public getDiaryAssetDataUrl(input: GetDiaryAssetInput): string {
    const diary = this.diaryRepository.getDiaryById(normalizeId(input.diaryId));
    if (!diary) {
      throw new Error(`Diary not found: ${input.diaryId}`);
    }

    const relativePath = normalizeAssetRelativePath(input.relativePath);
    const absolutePath = resolveDiaryAssetPath(diary.filepath, relativePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Diary asset not found: ${relativePath}`);
    }

    const mimeType = getMimeTypeFromFilePath(absolutePath);
    const base64 = fs.readFileSync(absolutePath).toString("base64");

    return `data:${mimeType};base64,${base64}`;
  }

  private attachDiaryMarkdown(diary: Diary): DiaryDetail {
    const diaryFile = readDiaryMarkdownFile(diary.filepath);
    const syncedDiary = this.syncDiaryTimestampsFromFrontMatter(diary, diaryFile.frontMatter);

    return {
      ...syncedDiary,
      markdown: diaryFile.markdown,
    };
  }

  private importMarkdownFile(absolutePath: string, filepath: string): Diary {
    const stat = fs.statSync(absolutePath);
    const rawMarkdown = fs.readFileSync(absolutePath, "utf8");
    const diaryFile = parseDiaryMarkdownFile(rawMarkdown);
    const now = Date.now();
    const fallbackCreatedAt = stat.birthtimeMs || stat.mtimeMs || now;
    const createdAt = diaryFile.frontMatter?.createdAt ?? fallbackCreatedAt;
    const fallbackUpdatedAt = stat.mtimeMs || createdAt;
    const updatedAt = diaryFile.frontMatter?.updatedAt ?? fallbackUpdatedAt;
    const title = normalizeTitle(
      diaryFile.frontMatter?.title ?? extractTitleFromMarkdown(diaryFile.markdown) ?? path.basename(filepath, ".md"),
    );
    const tags = normalizeTagNames(diaryFile.frontMatter?.tags ?? []);
    const mood =
      diaryFile.frontMatter?.mood === undefined ? DEFAULT_MOOD : normalizeMood(diaryFile.frontMatter.mood);
    const weather =
      diaryFile.frontMatter?.weather === undefined ? undefined : normalizeWeather(diaryFile.frontMatter.weather);

    this.tagRepository.ensureTagsExist(tags);

    const diary = this.diaryRepository.createDiary({
      id: randomUUID(),
      title,
      filepath,
      diaryDate: formatTimestampDate(createdAt),
      createdAt,
      updatedAt,
      tags,
      mood,
      weather,
    });

    this.diaryRepository.syncDiarySearchIndex({
      id: diary.id,
      title: diary.title,
      content: diaryFile.markdown,
    });

    return diary;
  }

  private syncDiaryTimestampsFromFrontMatter(
    diary: Diary,
    frontMatter: DiaryFrontMatter | undefined,
  ): Diary {
    if (!frontMatter) {
      return diary;
    }

    const shouldSyncCreatedAt =
      frontMatter.createdAt !== undefined &&
      formatLocalDateTime(frontMatter.createdAt) !== formatLocalDateTime(diary.createdAt);
    const shouldSyncUpdatedAt =
      frontMatter.updatedAt !== undefined &&
      formatLocalDateTime(frontMatter.updatedAt) !== formatLocalDateTime(diary.updatedAt);

    if (!shouldSyncCreatedAt && !shouldSyncUpdatedAt) {
      return diary;
    }

    const createdAt = shouldSyncCreatedAt ? frontMatter.createdAt ?? diary.createdAt : diary.createdAt;
    const updatedAt = shouldSyncUpdatedAt ? frontMatter.updatedAt ?? diary.updatedAt : diary.updatedAt;

    /*
     * Markdown 是用户可编辑文件；读到可读时间后同步回 SQLite 的毫秒字段。
     */
    return (
      this.diaryRepository.updateDiary({
        id: diary.id,
        diaryDate: formatTimestampDate(createdAt),
        createdAt,
        updatedAt,
      }) ?? {
        ...diary,
        diaryDate: formatTimestampDate(createdAt),
        createdAt,
        updatedAt,
      }
    );
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
    /*
     * 标题被清空时仍保存一个可展示的名称，避免列表和搜索索引出现空标题。
     */
    return CLEARED_DIARY_TITLE_FALLBACK;
  }

  return normalized;
}

/**
 * 标准化正文。
 *
 * 正文可能是 Markdown，首尾换行和缩进都可能是用户内容的一部分，所以这里只检查
 * trim 后不是空白文本，但返回原始字符串，避免无意修改用户写下的内容。
 */
function normalizeMarkdown(value: string): string {
  if (typeof value !== "string") {
    throw new Error("markdown must be a string.");
  }

  // if (!value.trim()) {
  //   throw new Error("markdown cannot be empty.");
  // }

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

function normalizeSearchKeyword(keyword: string): string {
  if (typeof keyword !== "string") {
    throw new Error("keyword must be a string.");
  }

  return keyword.trim();
}

/**
 * 校验 YYYY-MM-DD 日期格式。
 *
 * 这里先只做格式校验，不强行校验真实日历日期，避免时区转换带来额外复杂度。
 * 如果后续做日历视图，可以在 service 层进一步收紧规则。
 */
function normalizeDate(date: string, fieldName = "date"): string {
  if (typeof date !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  const normalized = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  return normalized;
}

function normalizeMood(mood: string): string | undefined {
  if (typeof mood !== "string") {
    throw new Error("mood must be a string.");
  }

  const normalized = mood.trim();
  return normalized ? normalized : undefined;
}

function normalizeMoodUpdateValue(mood: string | null): string | null | undefined {
  if (mood === null) {
    return null;
  }

  return normalizeMood(mood);
}

function normalizeWeather(weather: string): string | undefined {
  if (typeof weather !== "string") {
    throw new Error("weather must be a string.");
  }

  const normalized = weather.trim();
  const matchedWeather = formatWeather(normalized);

  /*
   * 这里沿用与心情相同的策略，允许历史数据里出现自定义值。
   */
  return normalized ? matchedWeather?.name ?? normalized : undefined;
}

function normalizeWeatherUpdateValue(weather: string | null): string | null | undefined {
  if (weather === null) {
    return null;
  }

  return normalizeWeather(weather);
}

/**
 * 生成本机本地日期字符串。
 *
 * SQLite 存储 diary_date TEXT，不存 Date 对象，这样 renderer 做日历分组时无需处理
 * UTC 日期偏移问题。
 */
function formatTimestampDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * 生成相对于 echoBookNotes 目录的文件路径。
 *
 * 格式为 YYYY/MM/YYYY_MM_DD_id.md，不再包含 echoBookNotes/ 前缀，
 * 因为 resolveDiaryFilePath 会基于 getNotesPath() 解析。
 */
function generateFilePath(createdAt: number, id: string): string {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}/${month}/${year}_${month}_${day}_${id}.md`;
}

function buildDiaryMarkdownFile(input: BuildDiaryMarkdownFileInput): string {
  const frontMatterLines = [
    "---",
    `title: ${formatYamlString(input.title)}`,
    `createdAt: ${formatLocalDateTime(input.createdAt)}`,
    `updatedAt: ${formatLocalDateTime(input.updatedAt)}`,
  ];

  if (input.tags.length > 0) {
    frontMatterLines.push("tags:");
    for (const tag of input.tags) {
      frontMatterLines.push(`  - ${formatYamlString(tag)}`);
    }
  } else {
    frontMatterLines.push("tags: []");
  }

  if (input.mood) {
    frontMatterLines.push(`mood: ${formatYamlString(input.mood)}`);
  }

  if (input.weather) {
    frontMatterLines.push(`weather: ${formatYamlString(input.weather)}`);
  }

  /*
   * 文件里保留一行空行分隔 Front Matter 和正文，读回编辑器时会移除这行。
   */
  return [...frontMatterLines, "---", "", input.markdown].join("\n");
}

function formatYamlString(value: string): string {
  /*
   * 用 JSON 字符串形式覆盖冒号、换行等特殊字符，仍然保持人眼可读。
   */
  return JSON.stringify(value);
}

function readDiaryMarkdownFile(filepath: string): DiaryMarkdownFile {
  const absolutePath = resolveDiaryFilePath(filepath);

  if (!fs.existsSync(absolutePath)) {
    return {
      markdown: "",
    };
  }

  return parseDiaryMarkdownFile(fs.readFileSync(absolutePath, "utf8"));
}

function parseDiaryMarkdownFile(rawMarkdown: string): DiaryMarkdownFile {
  const frontMatterBlock = splitFrontMatter(rawMarkdown);
  if (!frontMatterBlock) {
    return {
      markdown: rawMarkdown,
    };
  }

  const frontMatter = parseDiaryFrontMatter(frontMatterBlock.frontMatter);
  if (!frontMatter) {
    return {
      markdown: rawMarkdown,
    };
  }

  return {
    markdown: frontMatterBlock.markdown,
    frontMatter,
  };
}

function splitFrontMatter(markdown: string): { frontMatter: string; markdown: string } | null {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) {
    return null;
  }

  const firstLineEnd = markdown.indexOf("\n");
  const contentStart = firstLineEnd + 1;
  const rest = markdown.slice(contentStart);
  const closingBoundary = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(rest);

  if (!closingBoundary) {
    return null;
  }

  const markdownBodyStart = contentStart + closingBoundary.index + closingBoundary[0].length;

  return {
    frontMatter: rest.slice(0, closingBoundary.index),
    markdown: markdown.slice(markdownBodyStart).replace(/^\r?\n/, ""),
  };
}

function parseDiaryFrontMatter(frontMatter: string): DiaryFrontMatter | null {
  const parsed = {
    title: parseOptionalFrontMatterString(frontMatter, "title"),
    createdAt: parseFrontMatterTimestamp(frontMatter, "createdAt"),
    updatedAt: parseFrontMatterTimestamp(frontMatter, "updatedAt"),
    tags: parseFrontMatterTags(frontMatter),
    mood: parseOptionalFrontMatterString(frontMatter, "mood"),
    weather: parseOptionalFrontMatterString(frontMatter, "weather"),
  };

  if (
    parsed.title === undefined &&
    parsed.createdAt === undefined &&
    parsed.updatedAt === undefined &&
    parsed.tags === undefined &&
    parsed.mood === undefined &&
    parsed.weather === undefined
  ) {
    return null;
  }

  return parsed;
}

function parseOptionalFrontMatterString(frontMatter: string, fieldName: string): string | undefined {
  const line = frontMatter
    .split(/\r?\n/)
    .find((frontMatterLine) => frontMatterLine.startsWith(`${fieldName}:`));

  if (!line) {
    return undefined;
  }

  const value = parseYamlScalar(line.slice(fieldName.length + 1)).trim();
  return value ? value : undefined;
}

function parseFrontMatterTimestamp(frontMatter: string, fieldName: "createdAt" | "updatedAt"): number | undefined {
  const line = frontMatter
    .split(/\r?\n/)
    .find((frontMatterLine) => frontMatterLine.startsWith(`${fieldName}:`));

  if (!line) {
    return undefined;
  }

  const value = parseYamlScalar(line.slice(fieldName.length + 1));
  return parseLocalDateTime(value);
}

function parseFrontMatterTags(frontMatter: string): string[] | undefined {
  const lines = frontMatter.split(/\r?\n/);
  const tagLineIndex = lines.findIndex((frontMatterLine) => frontMatterLine.startsWith("tags:"));

  if (tagLineIndex < 0) {
    return undefined;
  }

  const firstValue = lines[tagLineIndex].slice("tags:".length).trim();
  if (firstValue === "[]") {
    return [];
  }

  if (firstValue.startsWith("[") && firstValue.endsWith("]")) {
    /*
     * 兼容简单的 JSON/YAML 行内数组，例如 tags: ["读书", "生活"]。
     */
    try {
      const parsed = JSON.parse(firstValue) as unknown;
      return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
    } catch {
      return firstValue
        .slice(1, -1)
        .split(",")
        .map((tag) => parseYamlScalar(tag))
        .filter(Boolean);
    }
  }

  const tags: string[] = [];
  for (const line of lines.slice(tagLineIndex + 1)) {
    const match = /^\s*-\s*(.*)$/.exec(line);
    if (!match) {
      break;
    }

    const tag = parseYamlScalar(match[1]).trim();
    if (tag) {
      tags.push(tag);
    }
  }

  return tags;
}

function parseYamlScalar(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return typeof parsed === "string" ? parsed : trimmed;
    } catch {
      return trimmed;
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }

  return trimmed;
}

function extractTitleFromMarkdown(markdown: string): string | undefined {
  const titleLine = markdown
    .split(/\r?\n/)
    .find((line) => /^#\s+/.test(line.trim()));

  if (!titleLine) {
    return undefined;
  }

  return titleLine.trim().replace(/^#\s+/, "").trim();
}

function formatLocalDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseLocalDateTime(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(year, month - 1, day, hour, minute, second);

  /*
   * Date 会自动进位，这里反查组件以拒绝 2026-02-31 这类无效日期。
   */
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return undefined;
  }

  return date.getTime();
}

function writeDiaryFile(filepath: string, markdown: string): void {
  const absolutePath = resolveDiaryFilePath(filepath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, markdown, "utf8");
}

interface MarkdownFileCandidate {
  absolutePath: string;
  filepath: string;
}

function listMarkdownFiles(notesPath: string): MarkdownFileCandidate[] {
  const files: MarkdownFileCandidate[] = [];

  function walk(directory: string): void {
    let entries: string[];

    try {
      entries = fs.readdirSync(directory);
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry);
      let stat: fs.Stats;

      try {
        stat = fs.lstatSync(absolutePath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        /*
         * assets 是日记附件目录，里面的 Markdown 不应被当作独立日记导入。
         */
        if (entry === "assets") {
          continue;
        }

        walk(absolutePath);
        continue;
      }

      if (stat.isFile() && entry.toLowerCase().endsWith(".md")) {
        files.push({
          absolutePath,
          filepath: toNotesRelativeFilepath(notesPath, absolutePath),
        });
      }
    }
  }

  walk(notesPath);
  return files;
}

function toNotesRelativeFilepath(notesPath: string, absolutePath: string): string {
  const relativePath = path.relative(notesPath, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid markdown filepath.");
  }

  /*
   * 数据库统一保存 POSIX 风格相对路径，避免跨平台路径分隔符泄漏到 renderer。
   */
  return relativePath.split(path.sep).join("/");
}

/**
 * 将相对路径解析为绝对路径。
 *
 * filepath 是相对于 getNotesPath() 的路径（例如 YYYY/MM/YYYY_MM_DD_id.md），
 * 这里拼接后做 path traversal 防护。
 */
function resolveDiaryFilePath(filepath: string): string {
  const notesPath = getNotesPath();
  const absolutePath = path.resolve(notesPath, filepath);
  const relativePath = path.relative(notesPath, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid diary filepath.");
  }

  return absolutePath;
}

function resolveDiaryAssetPath(diaryFilepath: string, assetRelativePath: string): string {
  const diaryFileAbsolutePath = resolveDiaryFilePath(diaryFilepath);
  const diaryDirectory = path.dirname(diaryFileAbsolutePath);
  const absolutePath = path.resolve(diaryDirectory, normalizeAssetRelativePath(assetRelativePath));
  const assetsDirectory = path.join(diaryDirectory, "assets");
  const relativePath = path.relative(assetsDirectory, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid diary asset path.");
  }

  return absolutePath;
}

function normalizeAssetRelativePath(relativePath: string): string {
  if (typeof relativePath !== "string") {
    throw new Error("asset path must be a string.");
  }

  const normalized = relativePath.trim().replace(/\\/g, "/");
  if (!/^assets\/[^/]+$/.test(normalized)) {
    throw new Error("asset path must point to the diary assets directory.");
  }

  return normalized;
}

function normalizeImageMimeType(mimeType: string): string {
  if (typeof mimeType !== "string") {
    throw new Error("mimeType must be a string.");
  }

  const normalized = mimeType.trim().toLowerCase();
  if (!normalized.startsWith("image/")) {
    throw new Error("only image files can be saved as diary assets.");
  }

  return normalized;
}

function getImageExtension(fileName: string, mimeType: string): string {
  const extensionFromMime = getImageExtensionFromMimeType(mimeType);
  if (extensionFromMime) {
    return extensionFromMime;
  }

  const extension = path.extname(fileName).replace(".", "").toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(extension)) {
    return extension;
  }

  return "png";
}

function getImageExtensionFromMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/avif":
      return "avif";
    default:
      return null;
  }
}

function getMimeTypeFromFilePath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}
