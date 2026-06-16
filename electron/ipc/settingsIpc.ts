import { ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { StorageInfo } from "../../shared/settings.js";
import { getDatabasePath } from "../db/connection.js";

/**
 * 设置 IPC 通道集中定义，避免 renderer 侧出现自由拼接的通道名。
 */
const SETTINGS_CHANNELS = {
  getStorageInfo: "settings:getStorageInfo",
  openStorageRoot: "settings:openStorageRoot",
} as const;

/**
 * 统一计算设置页需要展示和操作的存储路径。
 *
 * 打开目录和展示目录共用这一处逻辑，可以避免两个 handler 以后因为路径拼接规则不同
 * 展示 A 目录却打开 B 目录。
 */
function getStorageInfo(): StorageInfo {
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
}

/**
 * 注册设置相关 IPC handlers。
 *
 * 当前只读出日记文件和数据库的存放位置，并额外开放“打开应用存储根目录”。
 * 这里不接收 renderer 传来的路径参数，避免设置页变成任意文件系统入口。
 */
export function registerSettingsIpcHandlers(): void {
  ipcMain.handle(SETTINGS_CHANNELS.getStorageInfo, (): StorageInfo => {
    return getStorageInfo();
  });

  ipcMain.handle(SETTINGS_CHANNELS.openStorageRoot, async (): Promise<void> => {
    const { storageRoot } = getStorageInfo();
    const errorMessage = await shell.openPath(storageRoot);

    /*
     * shell.openPath 成功时返回空字符串，失败时返回平台相关错误文本。
     * 抛出 Error 可以让 renderer 侧统一走 Promise rejection，并显示用户可读提示。
     */
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  });
}
