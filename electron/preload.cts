import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateDiaryInput,
  DiaryApi,
  GetDiaryAssetInput,
  GetDiaryListOptions,
  SaveDiaryAssetInput,
  UpdateDiaryInput,
} from "../shared/diary.js";
import type { SettingsApi } from "../shared/settings.js";
import type { CreateTagInput, TagApi, UpdateTagInput } from "../shared/tags.js";

const RENDERER_ERROR_LOG_CHANNEL = "error-log:renderer-error";

function normalizeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    const jsonText = JSON.stringify(error);
    const hasJsonText = typeof jsonText === "string" && jsonText.length > 0;

    return hasJsonText ? jsonText : String(error);
  } catch {
    return String(error);
  }
}

function reportRendererError(payload: {
  kind: "error" | "unhandledrejection";
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}): void {
  /*
   * renderer 错误只单向上报给 main process，由 main process 统一写入 app error log。
   */
  ipcRenderer.send(RENDERER_ERROR_LOG_CHANNEL, payload);
}

window.addEventListener("error", (event) => {
  reportRendererError({
    kind: "error",
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: normalizeUnknownError(event.error),
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reasonText = normalizeUnknownError(event.reason);

  reportRendererError({
    kind: "unhandledrejection",
    message: reasonText,
    stack: reasonText,
  });
});

/**
 * preload 是 renderer 与 main process 之间唯一被允许的桥。
 *
 * 注意：这里不把 ipcRenderer 直接暴露给 window，而是只暴露明确的业务 API。
 * 这样 renderer 无法随意调用未知 IPC 通道，后续做权限控制和审计也更容易。
 */
const diaryAPI: DiaryApi = {
  createDiary(input: CreateDiaryInput) {
    return ipcRenderer.invoke("diary:create", input);
  },

  updateDiary(input: UpdateDiaryInput) {
    return ipcRenderer.invoke("diary:update", input);
  },

  deleteDiary(id: string) {
    return ipcRenderer.invoke("diary:delete", id);
  },

  getDiaryById(id: string) {
    return ipcRenderer.invoke("diary:getById", id);
  },

  getDiaryList(options?: GetDiaryListOptions) {
    return ipcRenderer.invoke("diary:list", options);
  },

  searchDiary(keyword: string) {
    return ipcRenderer.invoke("diary:search", keyword);
  },

  saveDiaryAsset(input: SaveDiaryAssetInput) {
    return ipcRenderer.invoke("diary:saveAsset", input);
  },

  getDiaryAssetDataUrl(input: GetDiaryAssetInput) {
    return ipcRenderer.invoke("diary:getAssetDataUrl", input);
  },
};

/**
 * 设置 API 暴露路径查询和受控目录打开动作。
 *
 * renderer 可以展示路径、请求 main process 打开固定目录，
 * 但不能借此获得 Node.js fs、Electron shell 或任意 IPC 调用权限。
 */
const settingsAPI: SettingsApi = {
  getStorageInfo() {
    return ipcRenderer.invoke("settings:getStorageInfo");
  },

  exportBackup() {
    return ipcRenderer.invoke("settings:exportBackup");
  },

  /*
   * 这里不从 renderer 接收路径参数。
   * 真正要打开的目录由 main process 根据 app.getPath("userData") 计算。
   */
  openStorageRoot() {
    return ipcRenderer.invoke("settings:openStorageRoot");
  },

  openNotesDirectory() {
    return ipcRenderer.invoke("settings:openNotesDirectory");
  },

  selectDirectory() {
    return ipcRenderer.invoke("settings:selectDirectory");
  },

  setCustomNotesPath(path: string) {
    return ipcRenderer.invoke("settings:setCustomNotesPath", path);
  },

  resetCustomNotesPath() {
    return ipcRenderer.invoke("settings:resetCustomNotesPath");
  },

  migrateNotes(newNotesPath: string) {
    return ipcRenderer.invoke("settings:migrateNotes", newNotesPath);
  },

  importBackupDirectory() {
    return ipcRenderer.invoke("settings:importBackupDirectory");
  },

  syncMarkdownFiles() {
    return ipcRenderer.invoke("settings:syncMarkdownFiles");
  },

  exportTodayErrorLog() {
    return ipcRenderer.invoke("settings:exportTodayErrorLog");
  },
};

/**
 * 标签库 API 只管理 tags 表，不直接修改任何日记。
 */
const tagAPI: TagApi = {
  getTagLibrary() {
    return ipcRenderer.invoke("tag:list");
  },

  createTag(input: CreateTagInput) {
    return ipcRenderer.invoke("tag:create", input);
  },

  updateTag(input: UpdateTagInput) {
    return ipcRenderer.invoke("tag:update", input);
  },

  deleteTag(name: string) {
    return ipcRenderer.invoke("tag:delete", name);
  },
};

/**
 * 将受控 API 挂到 window.diaryAPI。
 *
 * 因为 BrowserWindow 开启了 contextIsolation，renderer 拿到的是这个对象的安全代理，
 * 而不是 preload 的真实执行上下文。
 */
contextBridge.exposeInMainWorld("diaryAPI", diaryAPI);
contextBridge.exposeInMainWorld("settingsAPI", settingsAPI);
contextBridge.exposeInMainWorld("tagAPI", tagAPI);
