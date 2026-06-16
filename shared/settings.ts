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
}

export interface ExportBackupResult {
  canceled: boolean;
  filePath?: string;
}

/**
 * preload 暴露到 window.settingsAPI 的设置接口。
 */
export interface SettingsApi {
  getStorageInfo(): Promise<StorageInfo>;

  /**
   * 导出应用数据备份。
   *
   * renderer 只发起“导出当前应用数据”这个业务动作，保存路径由 main process 弹出
   * 系统保存对话框让用户选择；真正被打包的目录仍然固定为 database 和 notes。
   */
  exportBackup(): Promise<ExportBackupResult>;

  /**
   * 打开应用自己的存储根目录。
   *
   * renderer 只发起“打开当前应用目录”这个明确动作，不传入任意路径；
   * 实际路径仍由 main process 根据 Electron userData 目录计算，减少误开系统路径的风险。
   */
  openStorageRoot(): Promise<void>;
}
