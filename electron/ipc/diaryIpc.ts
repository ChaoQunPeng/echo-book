import { ipcMain } from "electron";
import type {
  CreateDiaryInput,
  GetDiaryAssetInput,
  GetDiaryListOptions,
  SaveDiaryAssetInput,
  UpdateDiaryInput,
} from "../../shared/diary.js";
import type { CreateTagInput, UpdateTagInput } from "../../shared/tags.js";
import { getDatabase } from "../db/connection.js";
import { initializeDatabase } from "../db/schema.js";
import { DiaryRepository } from "../repositories/diaryRepository.js";
import { TagRepository } from "../repositories/tagRepository.js";
import { DiaryService } from "../services/diaryService.js";
import { appendErrorLog } from "../services/errorLogService.js";
import { TagService } from "../services/tagService.js";

/**
 * 日记 IPC 通道名称。
 *
 * 通道名集中在这里，方便后续做权限审计、日志追踪或批量重命名。
 */
const DIARY_CHANNELS = {
  create: "diary:create",
  update: "diary:update",
  delete: "diary:delete",
  getById: "diary:getById",
  list: "diary:list",
  search: "diary:search",
  saveAsset: "diary:saveAsset",
  getAssetDataUrl: "diary:getAssetDataUrl",
} as const;

const TAG_CHANNELS = {
  list: "tag:list",
  create: "tag:create",
  update: "tag:update",
  delete: "tag:delete",
} as const;

/**
 * 注册日记相关 IPC handlers。
 *
 * 所有数据库能力都只在 main process 中执行，renderer 只能通过 preload 暴露的
 * window.diaryAPI 触发这些 handler。
 */
export function registerDiaryIpcHandlers(): void {
  initializeDatabase();

  const db = getDatabase();
  const diaryRepository = new DiaryRepository(db);
  const tagRepository = new TagRepository(db);
  const diaryService = new DiaryService(diaryRepository, tagRepository);
  const tagService = new TagService(tagRepository);

  /*
   * FTS 是可重建缓存，启动时从 Markdown 重新灌入，避免索引缺失或陈旧。
   */
  diaryService.rebuildDiarySearchIndex();

  ipcMain.handle(DIARY_CHANNELS.create, (_event, input: CreateDiaryInput) => {
    try {
      /*
       * 开发期诊断保存请求是否真正到达 main process。
       * 如果点击“创建日记”后终端没有这行日志，问题就在 renderer 侧按钮/表单链路。
       */
      console.info("Creating diary:", {
        title: input.title,
        diaryDate: input.diaryDate,
        markdownLength: input.markdown.length,
      });

      return diaryService.createDiary(input);
    } catch (error) {
      /*
       * 保存失败时把 main process 的真实错误留在终端里。
       * renderer 只能拿到跨进程后的 Error 文本，终端日志更适合定位 SQLite / 文件系统问题。
      */
      console.error("Failed to create diary:", error);
      appendErrorLog("diary:create", "Failed to create diary", error as Error);
      throw error;
    }
  });

  ipcMain.handle(DIARY_CHANNELS.update, (_event, input: UpdateDiaryInput) => {
    try {
      return diaryService.updateDiary(input);
    } catch (error) {
      /*
       * 更新链路同样记录原始错误，避免 renderer 只显示泛化的“保存失败”。
      */
      console.error("Failed to update diary:", error);
      appendErrorLog("diary:update", "Failed to update diary", error as Error);
      throw error;
    }
  });

  ipcMain.handle(DIARY_CHANNELS.delete, (_event, id: string) => {
    return diaryService.deleteDiary(id);
  });

  ipcMain.handle(DIARY_CHANNELS.getById, (_event, id: string) => {
    return diaryService.getDiaryById(id);
  });

  ipcMain.handle(DIARY_CHANNELS.list, (_event, options?: GetDiaryListOptions) => {
    return diaryService.getDiaryList(options);
  });

  ipcMain.handle(DIARY_CHANNELS.search, (_event, keyword: string) => {
    return diaryService.searchDiary(keyword);
  });

  ipcMain.handle(DIARY_CHANNELS.saveAsset, (_event, input: SaveDiaryAssetInput) => {
    try {
      /*
       * 图片资源只通过 service 落盘，确保 renderer 不能指定任意本机路径。
       */
      return diaryService.saveDiaryAsset(input);
    } catch (error) {
      console.error("Failed to save diary asset:", error);
      appendErrorLog("diary:saveAsset", "Failed to save diary asset", error as Error);
      throw error;
    }
  });

  ipcMain.handle(DIARY_CHANNELS.getAssetDataUrl, (_event, input: GetDiaryAssetInput) => {
    return diaryService.getDiaryAssetDataUrl(input);
  });

  ipcMain.handle(TAG_CHANNELS.list, () => {
    return tagService.getTagLibrary();
  });

  ipcMain.handle(TAG_CHANNELS.create, (_event, input: CreateTagInput) => {
    return tagService.createTag(input);
  });

  ipcMain.handle(TAG_CHANNELS.update, (_event, input: UpdateTagInput) => {
    return tagService.updateTag(input);
  });

  ipcMain.handle(TAG_CHANNELS.delete, (_event, name: string) => {
    return tagService.deleteTag(name);
  });
}
