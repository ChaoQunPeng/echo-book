import { contextBridge, ipcRenderer } from "electron";
import type {
  CreateDiaryInput,
  DiaryApi,
  GetDiaryListOptions,
  UpdateDiaryInput,
} from "../shared/diary.js";
import type { SettingsApi } from "../shared/settings.js";
import type { CreateTagInput, TagApi, UpdateTagInput } from "../shared/tags.js";

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
