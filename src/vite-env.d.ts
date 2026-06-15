/// <reference types="vite/client" />

import type { DiaryApi } from "../shared/diary";

/**
 * renderer 侧的 window 类型声明。
 *
 * 实际对象由 Electron preload 通过 contextBridge 注入。React 组件或其他 renderer
 * 代码可以直接获得完整类型提示，例如：window.diaryAPI.createDiary(...)
 */
declare global {
  interface Window {
    diaryAPI: DiaryApi;
  }
}

export {};
