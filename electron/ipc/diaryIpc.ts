import { ipcMain } from "electron";
import type { CreateDiaryInput, GetDiaryListOptions, UpdateDiaryInput } from "../../shared/diary.js";
import { getDatabase } from "../db/connection.js";
import { initializeDatabase } from "../db/schema.js";
import { DiaryRepository } from "../repositories/diaryRepository.js";
import { DiaryService } from "../services/diaryService.js";

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
} as const;

/**
 * 注册日记相关 IPC handlers。
 *
 * 所有数据库能力都只在 main process 中执行，renderer 只能通过 preload 暴露的
 * window.diaryAPI 触发这些 handler。
 */
export function registerDiaryIpcHandlers(): void {
  initializeDatabase();

  const diaryRepository = new DiaryRepository(getDatabase());
  const diaryService = new DiaryService(diaryRepository);

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
}
