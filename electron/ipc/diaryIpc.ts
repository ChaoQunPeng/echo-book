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
    return diaryService.createDiary(input);
  });

  ipcMain.handle(DIARY_CHANNELS.update, (_event, input: UpdateDiaryInput) => {
    return diaryService.updateDiary(input);
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
