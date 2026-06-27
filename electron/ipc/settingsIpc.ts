import { app, BrowserWindow, dialog, ipcMain, shell, type SaveDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  ExportBackupResult,
  ImportBackupDirectoryResult,
  MigrateNotesResult,
  SelectDirectoryResult,
  SetCustomNotesPathResult,
  StorageInfo,
  SyncMarkdownFilesResult,
} from "../../shared/settings.js";
import {
  getCustomNotesPathFromMemory,
  getDatabase,
  getDatabaseDirectoryPath,
  getDatabasePath,
  getDefaultNotesPath,
  getNotesDirectoryName,
  getNotesPath,
  getStorageRootPath,
  resetCustomNotesPath,
  setCustomNotesPath,
} from "../db/connection.js";
import { DiaryRepository } from "../repositories/diaryRepository.js";
import { TagRepository } from "../repositories/tagRepository.js";
import { DiaryService } from "../services/diaryService.js";
import { createStorageBackupZip } from "../services/exportService.js";

/**
 * 设置 IPC 通道集中定义，避免 renderer 侧出现自由拼接的通道名。
 */
const SETTINGS_CHANNELS = {
  getStorageInfo: "settings:getStorageInfo",
  exportBackup: "settings:exportBackup",
  openStorageRoot: "settings:openStorageRoot",
  openNotesDirectory: "settings:openNotesDirectory",
  selectDirectory: "settings:selectDirectory",
  setCustomNotesPath: "settings:setCustomNotesPath",
  resetCustomNotesPath: "settings:resetCustomNotesPath",
  migrateNotes: "settings:migrateNotes",
  importBackupDirectory: "settings:importBackupDirectory",
  syncMarkdownFiles: "settings:syncMarkdownFiles",
} as const;

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
   * 即使还没有日记，也先创建 database / echoBookNotes 根目录，避免用户按路径查找时看到目录不存在。
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

function createDiaryService(): DiaryService {
  const db = getDatabase();

  /*
   * 设置页的导入/扫描也复用日记 service，避免绕过日记元数据和 FTS 索引规则。
   */
  return new DiaryService(new DiaryRepository(db), new TagRepository(db));
}

function createCanceledImportResult(): ImportBackupDirectoryResult {
  return {
    ...createEmptyImportResult(true),
    success: true,
  };
}

function createEmptyImportResult(canceled: boolean): ImportBackupDirectoryResult {
  return {
    canceled,
    success: true,
    copiedCount: 0,
    skippedFileCount: 0,
    importedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    missingFileCount: 0,
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

      const selectedPath = path.resolve(directoryPath);
      const resolvedPath = resolveNotesDirectoryPath(directoryPath);

      if (!fs.existsSync(selectedPath)) {
        return { success: false, error: "目录不存在" };
      }

      if (!fs.statSync(selectedPath).isDirectory()) {
        return { success: false, error: "路径不是目录" };
      }

      /*
       * 用户选择父目录时，真正写入的是其中的 echoBookNotes 子目录。
       */
      fs.mkdirSync(resolvedPath, { recursive: true });
      setCustomNotesPath(resolvedPath);

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
      const resolvedNewPath = isResetToDefault ? getDefaultNotesPath() : resolveNotesDirectoryPath(newNotesPath);
      const { notesPath: oldNotesPath } = getStorageInfo();
      const resolvedOldPath = path.resolve(oldNotesPath);

      if (resolvedOldPath === resolvedNewPath) {
        if (isResetToDefault) {
          resetCustomNotesPath();
        }

        return { success: true, movedCount: 0 };
      }

      if (isPathInside(resolvedNewPath, resolvedOldPath)) {
        return { success: false, movedCount: 0, error: "新目录不能放在当前日记目录内部" };
      }

      if (!fs.existsSync(oldNotesPath)) {
        /*
         * 旧目录不存在，无需迁移。
         */
        fs.mkdirSync(resolvedNewPath, { recursive: true });
        applyNotesPathSelection(isResetToDefault, resolvedNewPath);
        return { success: true, movedCount: 0 };
      }

      /*
       * 迁移 echoBookNotes 整个目录，确保 Markdown 同级 assets 图片不会丢失。
       */
      const movedCount = countMarkdownFiles(oldNotesPath);
      moveNotesDirectory(oldNotesPath, resolvedNewPath);

      /*
       * 更新自定义路径持久化。
       */
      applyNotesPathSelection(isResetToDefault, resolvedNewPath);

      return { success: true, movedCount };
    } catch (error) {
      return { success: false, movedCount: 0, error: `迁移失败: ${(error as Error).message}` };
    }
  });

  ipcMain.handle(SETTINGS_CHANNELS.importBackupDirectory, async (event): Promise<ImportBackupDirectoryResult> => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      title: "选择要导入的备份文件夹",
      buttonLabel: "导入",
      properties: ["openDirectory"] as Array<"openDirectory">,
    };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return createCanceledImportResult();
    }

    try {
      const selectedPath = result.filePaths[0];
      const sourcePath = resolveBackupNotesSourcePath(selectedPath);
      if (!sourcePath) {
        return {
          ...createEmptyImportResult(false),
          success: false,
          error: "未找到可导入的 Markdown 备份目录",
          sourcePath: selectedPath,
        };
      }

      const { notesPath } = getStorageInfo();
      if (path.resolve(sourcePath) !== path.resolve(notesPath)) {
        if (isPathInside(notesPath, sourcePath)) {
          return {
            ...createEmptyImportResult(false),
            success: false,
            error: "备份目录不能包含当前日记目录",
            sourcePath,
          };
        }
      }

      /*
       * 文件合并后立即扫描，让列表不需要用户再手动更新数据库。
       */
      const copyResult = path.resolve(sourcePath) === path.resolve(notesPath)
        ? { copiedCount: 0, skippedFileCount: 0 }
        : copyBackupDirectory(sourcePath, notesPath);
      const syncResult = createDiaryService().syncMarkdownFilesToDatabase();

      return {
        ...syncResult,
        canceled: false,
        copiedCount: copyResult.copiedCount,
        skippedFileCount: copyResult.skippedFileCount,
        sourcePath,
      };
    } catch (error) {
      return {
        ...createEmptyImportResult(false),
        success: false,
        error: `导入备份失败: ${(error as Error).message}`,
      };
    }
  });

  ipcMain.handle(SETTINGS_CHANNELS.syncMarkdownFiles, (): SyncMarkdownFilesResult => {
    try {
      return createDiaryService().syncMarkdownFilesToDatabase();
    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        missingFileCount: 0,
        error: `扫描本地文件失败: ${(error as Error).message}`,
      };
    }
  });

  ipcMain.handle(SETTINGS_CHANNELS.exportBackup, async (event): Promise<ExportBackupResult> => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const backupFolderName = `EchoBook_${formatBackupTimestamp(new Date())}`;
    const defaultPath = path.join(app.getPath("documents"), `${backupFolderName}.zip`);
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

    const { notesPath } = getStorageInfo();

    createStorageBackupZip(
      result.filePath,
      [
        {
          /*
           * 压缩包内只保留同名备份目录和 echoBookNotes，避免带出数据库等额外文件。
           */
          sourcePath: notesPath,
          archivePath: `${backupFolderName}/${getNotesDirectoryName()}`,
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

  ipcMain.handle(SETTINGS_CHANNELS.openNotesDirectory, async (): Promise<void> => {
    const { notesPath } = getStorageInfo();
    const errorMessage = await shell.openPath(notesPath);

    /*
     * 打开当前日记存放目录（可能是自定义目录）。
     */
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  });
}

/**
 * 将用户选择的位置标准化为真正的 echoBookNotes 目录。
 *
 * 用户选择 /Users/.../Documents 时，最终目录固定为 /Users/.../Documents/echoBookNotes。
 */
function resolveNotesDirectoryPath(selectedPath: string): string {
  const resolvedPath = path.resolve(selectedPath);

  if (path.basename(resolvedPath) === getNotesDirectoryName()) {
    return resolvedPath;
  }

  return path.join(resolvedPath, getNotesDirectoryName());
}

function resolveBackupNotesSourcePath(selectedPath: string): string | null {
  const resolvedPath = path.resolve(selectedPath);
  const directNotesPath = path.join(resolvedPath, getNotesDirectoryName());

  if (isDirectory(resolvedPath) && path.basename(resolvedPath) === getNotesDirectoryName()) {
    return resolvedPath;
  }

  if (isDirectory(directNotesPath)) {
    return directNotesPath;
  }

  /*
   * 兼容从 zip 解压后的 EchoBook_xxx/echoBookNotes 这类备份父目录。
   */
  const nestedNotesPath = findNestedNotesDirectory(resolvedPath);
  if (nestedNotesPath) {
    return nestedNotesPath;
  }

  /*
   * 如果用户选择的是普通 Markdown 文件夹，也允许作为导入来源。
   */
  return countMarkdownFiles(resolvedPath) > 0 ? resolvedPath : null;
}

function findNestedNotesDirectory(directoryPath: string): string | null {
  let entries: string[];

  try {
    entries = fs.readdirSync(directoryPath);
  } catch {
    return null;
  }

  for (const entry of entries) {
    const candidate = path.join(directoryPath, entry, getNotesDirectoryName());
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isDirectory(directoryPath: string): boolean {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
}

function applyNotesPathSelection(isResetToDefault: boolean, resolvedNotesPath: string): void {
  if (isResetToDefault) {
    resetCustomNotesPath();
    return;
  }

  setCustomNotesPath(resolvedNotesPath);
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);

  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

interface CopyBackupDirectoryResult {
  copiedCount: number;
  skippedFileCount: number;
}

function copyBackupDirectory(sourcePath: string, targetPath: string): CopyBackupDirectoryResult {
  const result: CopyBackupDirectoryResult = {
    copiedCount: 0,
    skippedFileCount: 0,
  };
  const resolvedSourcePath = path.resolve(sourcePath);
  const resolvedTargetPath = path.resolve(targetPath);

  fs.mkdirSync(resolvedTargetPath, { recursive: true });

  function copyEntry(currentSourcePath: string): void {
    let stat: fs.Stats;

    try {
      stat = fs.lstatSync(currentSourcePath);
    } catch {
      return;
    }

    if (stat.isSymbolicLink()) {
      return;
    }

    const relativePath = path.relative(resolvedSourcePath, currentSourcePath);
    const currentTargetPath = path.join(resolvedTargetPath, relativePath);

    if (stat.isDirectory()) {
      fs.mkdirSync(currentTargetPath, { recursive: true });
      for (const entry of fs.readdirSync(currentSourcePath)) {
        copyEntry(path.join(currentSourcePath, entry));
      }
      return;
    }

    if (!stat.isFile()) {
      return;
    }

    if (fs.existsSync(currentTargetPath)) {
      /*
       * 导入备份默认不覆盖当前文件，避免把用户正在编辑的 Markdown 冲掉。
       */
      result.skippedFileCount += 1;
      return;
    }

    fs.mkdirSync(path.dirname(currentTargetPath), { recursive: true });
    fs.copyFileSync(currentSourcePath, currentTargetPath);
    result.copiedCount += 1;
  }

  copyEntry(resolvedSourcePath);
  return result;
}

/**
 * 递归统计日记 Markdown 数量，用于迁移后的用户提示。
 */
function countMarkdownFiles(rootPath: string): number {
  let count = 0;

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
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.toLowerCase().endsWith(".md")) {
        count += 1;
      }
    }
  }

  walk(rootPath);
  return count;
}

/**
 * 整体迁移 echoBookNotes 目录。
 *
 * 这里复制的是目录本身，而不是把内容摊到用户选择的目录里。
 */
function moveNotesDirectory(sourcePath: string, targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
    /*
     * 日记目录只迁移真实文件和真实目录，避免符号链接把目录外文件带过去。
     */
    filter(source) {
      return !fs.lstatSync(source).isSymbolicLink();
    },
  });
  fs.rmSync(sourcePath, { recursive: true, force: true });
}

function formatBackupTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}_${hour}${minute}${second}`;
}
