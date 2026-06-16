import { ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { StorageInfo } from "../../shared/settings.js";
import { getDatabasePath } from "../db/connection.js";

/**
 * 设置 IPC 通道集中定义，避免 renderer 侧出现自由拼接的通道名。
 */
const SETTINGS_CHANNELS = {
  getStorageInfo: "settings:getStorageInfo",
} as const;

/**
 * 注册设置相关 IPC handlers。
 *
 * 当前只读出日记文件和数据库的存放位置，不开放任意文件系统访问能力。
 */
export function registerSettingsIpcHandlers(): void {
  ipcMain.handle(SETTINGS_CHANNELS.getStorageInfo, (): StorageInfo => {
    const databasePath = getDatabasePath();
    const storageRoot = path.dirname(databasePath);
    const notesPath = path.join(storageRoot, "notes");

    /*
     * 设置页展示的是用户要去找的真实目录。
     * 即使还没有日记，也先创建 notes 根目录，避免用户按路径查找时看到目录不存在。
     */
    fs.mkdirSync(notesPath, { recursive: true });

    return {
      storageRoot,
      notesPath,
      databasePath,
    };
  });
}
