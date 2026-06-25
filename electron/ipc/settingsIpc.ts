import { app, BrowserWindow, dialog, ipcMain, shell, type SaveDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  ExportBackupResult,
  MigrateNotesResult,
  SelectDirectoryResult,
  SetCustomNotesPathResult,
  StorageInfo,
} from "../../shared/settings.js";
import {
  checkpointDatabase,
  getCustomNotesPathFromMemory,
  getDatabaseDirectoryPath,
  getDatabasePath,
  getDefaultNotesPath,
  getNotesPath,
  getStorageRootPath,
  resetCustomNotesPath,
  setCustomNotesPath,
} from "../db/connection.js";
import { createStorageBackupZip } from "../services/exportService.js";

/**
 * 设置 IPC 通道集中定义，避免 renderer 侧出现自由拼接的通道名。
 */
const SETTINGS_CHANNELS = {
  getStorageInfo: "settings:getStorageInfo",
  exportBackup: "settings:exportBackup",
  openStorageRoot: "settings:openStorageRoot",
  selectDirectory: "settings:selectDirectory",
  setCustomNotesPath: "settings:setCustomNotesPath",
  resetCustomNotesPath: "settings:resetCustomNotesPath",
  migrateNotes: "settings:migrateNotes",
} as const;
const BACKUP_README_FILE_NAME = "导出须知.txt";

/**
 * 统一计算设置页需要展示和操作的存储路径。
 *
 * 打开目录和展示目录共用这一处逻辑，可以避免两个 handler 以后因为路径拼接规则不同
 * 展示 A 目录却打开 B 目录。
 */
function getStorageInfo(): StorageInfo {
  const databasePath = getDatabasePath();
  const storageRoot = getStorageRootPath();
  const notesPath = getNotesPath();
  const databaseDirectoryPath = getDatabaseDirectoryPath();

  /*
   * 设置页展示的是用户要去找的真实目录。
   * 即使还没有日记，也先创建 database / notes 根目录，避免用户按路径查找时看到目录不存在。
   */
  fs.mkdirSync(databaseDirectoryPath, { recursive: true });
  fs.mkdirSync(notesPath, { recursive: true });

  return {
    storageRoot,
    notesPath,
    databaseDirectoryPath,
    databasePath,
    customNotesPath: getCustomNotesPathFromMemory(),
  };
}

/**
 * 注册设置相关 IPC handlers。
 *
 * 当前只读出日记文件和数据库的存放位置，并额外开放"打开应用存储根目录"。
 * 这里不接收 renderer 传来的路径参数，避免设置页变成任意文件系统入口。
 */
export function registerSettingsIpcHandlers(): void {
  ipcMain.handle(SETTINGS_CHANNELS.getStorageInfo, (): StorageInfo => {
    return getStorageInfo();
  });

  ipcMain.handle(SETTINGS_CHANNELS.selectDirectory, async (event): Promise<SelectDirectoryResult> => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      title: "选择日记存放目录",
      buttonLabel: "选择",
      properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
    };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    return { canceled: false, directoryPath: result.filePaths[0] };
  });

  ipcMain.handle(SETTINGS_CHANNELS.setCustomNotesPath, (_event, directoryPath: string): SetCustomNotesPathResult => {
    try {
      if (!directoryPath || typeof directoryPath !== "string") {
        return { success: false, error: "目录路径不能为空" };
      }

      const resolvedPath = path.resolve(directoryPath);

      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: "目录不存在" };
      }

      if (!fs.statSync(resolvedPath).isDirectory()) {
        return { success: false, error: "路径不是目录" };
      }

      setCustomNotesPath(resolvedPath);

      /*
       * 确保新目录已经创建好。
       */
      fs.mkdirSync(resolvedPath, { recursive: true });

      return { success: true };
    } catch (error) {
      return { success: false, error: `设置自定义目录失败: ${(error as Error).message}` };
    }
  });

  ipcMain.handle(SETTINGS_CHANNELS.resetCustomNotesPath, (): SetCustomNotesPathResult => {
    try {
      resetCustomNotesPath();
      return { success: true };
    } catch (error) {
      return { success: false, error: `重置目录失败: ${(error as Error).message}` };
    }
  });

  ipcMain.handle(SETTINGS_CHANNELS.migrateNotes, async (_event, newNotesPath: string): Promise<MigrateNotesResult> => {
    try {
      if (!newNotesPath || typeof newNotesPath !== "string") {
        return { success: false, movedCount: 0, error: "新目录路径不能为空" };
      }

      /*
       * 特殊标记：重置为默认目录。
       */
      const isResetToDefault = newNotesPath === "__RESET_TO_DEFAULT__";
      const resolvedNewPath = isResetToDefault ? getDefaultNotesPath() : path.resolve(newNotesPath);
      const { notesPath: oldNotesPath } = getStorageInfo();

      if (path.resolve(oldNotesPath) === resolvedNewPath) {
        return { success: true, movedCount: 0 };
      }

      if (!fs.existsSync(resolvedNewPath)) {
        fs.mkdirSync(resolvedNewPath, { recursive: true });
      }

      if (!fs.existsSync(oldNotesPath)) {
        /*
         * 旧目录不存在，无需迁移。
         */
        setCustomNotesPath(resolvedNewPath);
        return { success: true, movedCount: 0 };
      }

      /*
       * 获取当前 notes 下所有 Markdown 文件。
       */
      const markdownFiles = collectMarkdownFiles(oldNotesPath);
      let movedCount = 0;

      for (const relativePath of markdownFiles) {
        const sourcePath = path.join(oldNotesPath, relativePath);
        const targetPath = path.join(resolvedNewPath, relativePath);

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
        fs.unlinkSync(sourcePath);
        movedCount += 1;
      }

      /*
       * 删除旧的空目录结构。
       */
      removeEmptyDirectories(oldNotesPath);

      /*
       * 更新自定义路径持久化。
       */
      setCustomNotesPath(resolvedNewPath);

      return { success: true, movedCount };
    } catch (error) {
      return { success: false, movedCount: 0, error: `迁移失败: ${(error as Error).message}` };
    }
  });

  ipcMain.handle(SETTINGS_CHANNELS.exportBackup, async (event): Promise<ExportBackupResult> => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const defaultPath = path.join(
      app.getPath("documents"),
      `EchoBook-backup-${formatBackupTimestamp(new Date())}.zip`,
    );
    const dialogOptions: SaveDialogOptions = {
      title: "导出 EchoBook 备份",
      defaultPath,
      buttonLabel: "导出",
      filters: [{ name: "ZIP 备份文件", extensions: ["zip"] }],
      properties: ["showOverwriteConfirmation"],
    };
    const result = focusedWindow
      ? await dialog.showSaveDialog(focusedWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const { databaseDirectoryPath, databasePath, notesPath } = getStorageInfo();

    /*
     * SQLite 开启 WAL 后，新数据可能先写在 diaries.db-wal 里。
     * 导出前主动 checkpoint 一次，让主库文件尽量包含最新内容；随后仍然整体打包
     * database 文件夹，保留 SQLite 自己认为需要的伴随文件。
     */
    checkpointDatabase();

    createStorageBackupZip(
      result.filePath,
      [
        {
          sourcePath: databaseDirectoryPath,
          archivePath: "database",
        },
        {
          sourcePath: notesPath,
          archivePath: "notes",
        },
      ],
      [
        {
          archivePath: BACKUP_README_FILE_NAME,
          content: createBackupReadmeContent(path.basename(databasePath)),
        },
      ],
    );

    return {
      canceled: false,
      filePath: result.filePath.toLowerCase().endsWith(".zip") ? result.filePath : `${result.filePath}.zip`,
    };
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

/**
 * 递归收集指定目录下的所有 .md 文件，返回相对于根目录的路径列表。
 */
function collectMarkdownFiles(rootPath: string): string[] {
  const files: string[] = [];

  function walk(directory: string): void {
    let entries: string[];

    try {
      entries = fs.readdirSync(directory);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry);
      let stat: fs.Stats;

      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.toLowerCase().endsWith(".md")) {
        files.push(path.relative(rootPath, fullPath));
      }
    }
  }

  walk(rootPath);
  return files;
}

/**
 * 递归删除空目录（从叶子向根 cleanup）。
 */
function removeEmptyDirectories(directory: string): void {
  let entries: string[];

  try {
    entries = fs.readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);

    try {
      if (fs.statSync(fullPath).isDirectory()) {
        removeEmptyDirectories(fullPath);
      }
    } catch {
      // ignored
    }
  }

  try {
    if (fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
    }
  } catch {
    // ignored
  }
}

function formatBackupTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function createBackupReadmeContent(databaseFileName: string): string {
  /*
   * 说明文件放在 zip 根目录，用户解压后第一眼就能看到。
   * 内容只解释备份结构，不写入本机绝对路径，避免用户分享备份时泄露本机用户名或目录。
   */
  return [
    "EchoBook 备份说明",
    "",
    "database/",
    `- 存放 EchoBook 的 SQLite 数据库文件，例如 ${databaseFileName}。`,
    `- 如果看到 ${databaseFileName}-wal 或 ${databaseFileName}-shm，它们是 SQLite 在 WAL 模式下生成的伴随文件。`,
    "- 数据库主要保存日记索引、标题、日期、标签、心情、软删除状态等结构化信息。",
    "",
    "notes/",
    "- 存放每篇日记的 Markdown 正文文件。",
    "- 目录通常按年份和月份分组，文件名中包含日期和日记 id。",
    "",
    "恢复或迁移时，请保持 database 和 notes 两个文件夹的相对结构不变。",
    "建议在 EchoBook 未运行时恢复备份，避免覆盖正在写入的数据。",
    "",
  ].join("\n");
}