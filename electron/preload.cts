import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateDiaryInput,
  DiaryApi,
  GetDiaryListOptions,
  UpdateDiaryInput,
} from "../shared/diary.js";
import type { SettingsApi } from "../shared/settings.js";

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
};

/**
 * 设置 API 只暴露只读信息。
 *
 * renderer 可以展示路径，但不能借此获得 Node.js fs 或任意 IPC 调用权限。
 */
const settingsAPI: SettingsApi = {
  getStorageInfo() {
    return ipcRenderer.invoke("settings:getStorageInfo");
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
