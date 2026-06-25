/**
 * 日记业务在 main / preload / renderer 三侧共享的公共类型。
 *
 * 这里刻意只放“可跨进程传输”的纯数据结构，避免把 Electron、SQLite
 * 或任何 Node.js 运行时对象暴露给渲染层。后续如果要扩展 search、导入导出、
 * 标签管理等能力，也建议先从这里扩展稳定的输入输出契约。
 */

/**
 * 渲染层可见的日记实体。
 *
 * SQLite 表中使用 snake_case 字段（diary_date / created_at / updated_at），这里转换成
 * 前端更自然的 camelCase，避免把数据库字段命名泄漏到 UI 层。
 */
export interface Diary {
  id: string;
  title: string;
  filepath: string;
  diaryDate: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  mood?: string;
  weather?: string;
  deleted: boolean;
}

/**
 * 带正文的日记详情。
 *
 * Diary 本身只表示数据库里的索引元信息；正文只从 Markdown 文件读取，
 * 用 markdown 字段显式表达它不是 SQLite 表字段。
 */
export interface DiaryDetail extends Diary {
  markdown: string;
}

/**
 * 创建日记时 renderer 需要传入的数据。
 *
 * diaryDate 允许为空：为空时 service 层会按本机当前日期生成 YYYY-MM-DD。
 * tags 允许为空：为空时日记保存为空标签数组。
 */
export interface CreateDiaryInput {
  title: string;
  markdown: string;
  diaryDate?: string;
  tags?: string[];
  mood?: string;
  weather?: string;
}

/**
 * 更新日记时 renderer 需要传入的数据。
 *
 * 除 id 外所有字段都是可选字段，repository 层会只更新实际传入的字段，
 * 这样后续增加字段时不会破坏已有调用方。
 */
export interface UpdateDiaryInput {
  id: string;
  title?: string;
  markdown?: string;
  diaryDate?: string;
  tags?: string[];
  mood?: string | null;
  weather?: string | null;
}

/**
 * 保存到日记 assets 目录的图片输入。
 *
 * renderer 只能把二进制数据交给 main process，由 service 决定真实落盘路径。
 */
export interface SaveDiaryAssetInput {
  diaryId: string;
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
}

/**
 * 图片保存后的 Markdown 引用信息。
 *
 * relativePath 是写进 Markdown 的相对路径，例如 assets/xxx.png。
 */
export interface DiaryAsset {
  relativePath: string;
  fileName: string;
  mimeType: string;
}

/**
 * 读取日记 assets 图片时使用的受控输入。
 */
export interface GetDiaryAssetInput {
  diaryId: string;
  relativePath: string;
}

/**
 * 查询日记列表的参数。
 *
 * 目前先提供分页、日期过滤和是否包含软删除数据。搜索、标签筛选等能力后续可以
 * 在这个结构上继续增加字段，而不需要改动 IPC 通道名称。
 */
export interface GetDiaryListOptions {
  limit?: number;
  offset?: number;
  diaryDate?: string;
  tagId?: string;
  includeDeleted?: boolean;
}

/**
 * preload 暴露到 window.diaryAPI 的完整接口类型。
 *
 * renderer 只能通过这些 Promise API 访问数据，不能直接拿到 ipcRenderer、
 * 数据库连接或 Node.js 文件系统能力。
 */
export interface DiaryApi {
  createDiary(input: CreateDiaryInput): Promise<DiaryDetail>;
  updateDiary(input: UpdateDiaryInput): Promise<DiaryDetail>;
  deleteDiary(id: string): Promise<{ success: boolean }>;
  getDiaryById(id: string): Promise<DiaryDetail | null>;
  getDiaryList(options?: GetDiaryListOptions): Promise<Diary[]>;
  searchDiary(keyword: string): Promise<Diary[]>;
  saveDiaryAsset(input: SaveDiaryAssetInput): Promise<DiaryAsset>;
  getDiaryAssetDataUrl(input: GetDiaryAssetInput): Promise<string>;
}
