/*
 * @Author: PengChaoQun 1152684231@qq.com
 * @Date: 2026-06-18 12:29:52
 * @LastEditors: PengChaoQun 1152684231@qq.com
 * @LastEditTime: 2026-06-25 10:31:41
 * @FilePath: /echo-book/shared/settings.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 设置页只读取路径类信息，并提供少量受控桌面动作。
 *
 * 这些路径来自 Electron main process，renderer 不直接拼接 app.getPath，
 * 可以避免浏览器环境和桌面环境的路径规则混在一起。
 */
export interface StorageInfo {
  storageRoot: string;
  notesPath: string;
  databaseDirectoryPath: string;
  databasePath: string;

  /**
   * 当前自定义 echoBookNotes 路径（如果未自定义则为 null）。
   */
  customNotesPath: string | null;
}

export interface ExportBackupResult {
  canceled: boolean;
  filePath?: string;
}

/**
 * 选择目录对话框的返回结果。
 */
export interface SelectDirectoryResult {
  canceled: boolean;
  directoryPath?: string;
}

/**
 * 设置自定义 echoBookNotes 路径的结果。
 */
export interface SetCustomNotesPathResult {
  success: boolean;
  error?: string;
}

/**
 * 迁移笔记的结果。
 */
export interface MigrateNotesResult {
  success: boolean;
  movedCount: number;
  error?: string;
}

/**
 * 扫描 Markdown 文件并同步到 SQLite 后的汇总结果。
 */
export interface SyncMarkdownFilesResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  missingFileCount: number;
  error?: string;
}

/**
 * 导入备份文件夹后的汇总结果。
 */
export interface ImportBackupDirectoryResult extends SyncMarkdownFilesResult {
  canceled: boolean;
  copiedCount: number;
  skippedFileCount: number;
  sourcePath?: string;
}

/**
 * preload 暴露到 window.settingsAPI 的设置接口。
 */
export interface SettingsApi {
  getStorageInfo(): Promise<StorageInfo>;

  /**
   * 导出应用数据备份。
   *
   * renderer 只发起"导出当前应用数据"这个业务动作，保存路径由 main process 弹出
   * 系统保存对话框让用户选择；真正被打包的是当前 echoBookNotes 日记目录。
   */
  exportBackup(): Promise<ExportBackupResult>;

  /**
   * 打开应用自己的存储根目录。
   *
   * renderer 只发起"打开当前应用目录"这个明确动作，不传入任意路径；
   * 实际路径仍由 main process 根据 Electron userData 目录计算，减少误开系统路径的风险。
   */
  openStorageRoot(): Promise<void>;

  /**
   * 打开当前日记文件存放目录（可能是自定义的 echoBookNotes 目录）。
   */
  openNotesDirectory(): Promise<void>;

  /**
   * 弹出系统目录选择对话框，让用户选择一个文件夹作为日记存放目录。
   *
   * 只返回选择的路径，不执行任何写入操作。
   */
  selectDirectory(): Promise<SelectDirectoryResult>;

  /**
   * 设置自定义 echoBookNotes 目录路径并持久化到 settings 表。
   *
   * 调用前应确保用户已通过 selectDirectory 选择了路径。
   */
  setCustomNotesPath(path: string): Promise<SetCustomNotesPathResult>;

  /**
   * 重置自定义 echoBookNotes 目录为默认值。
   */
  resetCustomNotesPath(): Promise<SetCustomNotesPathResult>;

  /**
   * 将现有笔记从旧的 echoBookNotes 目录迁移到新的目录。
   *
   * 迁移逻辑由 main process 处理，包括文件复制和数据库 filepath 更新。
   */
  migrateNotes(newNotesPath: string): Promise<MigrateNotesResult>;

  /**
   * 从备份文件夹导入 Markdown 和 assets，并自动同步到日记列表。
   */
  importBackupDirectory(): Promise<ImportBackupDirectoryResult>;

  /**
   * 扫描当前 echoBookNotes 目录，把未入库的 Markdown 添加到 SQLite。
   */
  syncMarkdownFiles(): Promise<SyncMarkdownFilesResult>;
}
