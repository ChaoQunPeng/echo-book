/**
 * 设置页只需要读取路径类信息，保持为只读 API。
 *
 * 这些路径来自 Electron main process，renderer 不直接拼接 app.getPath，
 * 可以避免浏览器环境和桌面环境的路径规则混在一起。
 */
export interface StorageInfo {
  storageRoot: string;
  notesPath: string;
  databasePath: string;
}

/**
 * preload 暴露到 window.settingsAPI 的设置接口。
 */
export interface SettingsApi {
  getStorageInfo(): Promise<StorageInfo>;
}
