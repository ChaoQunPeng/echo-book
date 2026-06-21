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
import { DEFAULT_MOOD } from "../../shared/moods.js";
import { getStorageRootPath } from "../db/connection.js";
import type { DiaryRepository } from "../repositories/diaryRepository.js";
import type { TagRepository } from "../repositories/tagRepository.js";
import { normalizeTagNames } from "./tagService.js";

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
  ) {}

  /**
   * 创建日记。
   *
   * id 使用 crypto.randomUUID() 生成，created_at / updated_at 使用毫秒时间戳。
   * Markdown 文件写在 userData/notes 下，SQLite 只保存相对 filepath。
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

    writeDiaryFile(filepath, markdown);
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
      mood: input.mood === undefined ? DEFAULT_MOOD : normalizeMood(input.mood),
    });

    return attachDiaryMarkdown(diary);
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

    if (markdown !== undefined) {
      writeDiaryFile(existingDiary.filepath, markdown);
    }

    const tags = input.tags === undefined ? undefined : normalizeTagNames(input.tags);
    if (tags !== undefined) {
      this.tagRepository.ensureTagsExist(tags);
    }

    const updatedDiary = this.diaryRepository.updateDiary({
      id,
      title: input.title === undefined ? undefined : normalizeTitle(input.title),
      /*
       * 更新旧日记时也按 createdAt 回填 diaryDate，避免历史入口传入不同日期。
       */
      diaryDate: formatTimestampDate(existingDiary.createdAt),
      tags,
      mood:
        input.mood === undefined
          ? undefined
          : normalizeMoodUpdateValue(input.mood),
      updatedAt: Date.now(),
    });

    if (!updatedDiary) {
      throw new Error(`Diary not found: ${id}`);
    }

    return attachDiaryMarkdown(updatedDiary);
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
    return diary ? attachDiaryMarkdown(diary) : null;
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
function normalizeMarkdown(value: string): string {
  if (typeof value !== "string") {
    throw new Error("markdown must be a string.");
  }

  if (!value.trim()) {
    throw new Error("markdown cannot be empty.");
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

function generateFilePath(createdAt: number, id: string): string {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `notes/${year}/${month}/${year}_${month}_${day}_${id}.md`;
}

function writeDiaryFile(filepath: string, markdown: string): void {
  const absolutePath = resolveDiaryFilePath(filepath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, markdown, "utf8");
}

function attachDiaryMarkdown(diary: Diary): DiaryDetail {
  const absolutePath = resolveDiaryFilePath(diary.filepath);

  if (!fs.existsSync(absolutePath)) {
    return {
      ...diary,
      markdown: "",
    };
  }

  return {
    ...diary,
    markdown: fs.readFileSync(absolutePath, "utf8"),
  };
}

function resolveDiaryFilePath(filepath: string): string {
  const storageRoot = getStorageRootPath();
  const absolutePath = path.resolve(storageRoot, filepath);
  const relativePath = path.relative(storageRoot, absolutePath);

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
