/**
 * 标签库只服务快捷选择和自动补全，不表示日记标签的引用关系。
 */
export interface TagLibraryItem {
  name: string;
  color: string;
  createdAt: number;
}

export interface CreateTagInput {
  name: string;
  color: string;
}

export interface UpdateTagInput {
  oldName: string;
  name: string;
  color: string;
}

/**
 * renderer 侧可用的标签库 API。
 */
export interface TagApi {
  getTagLibrary(): Promise<TagLibraryItem[]>;
  createTag(input: CreateTagInput): Promise<TagLibraryItem>;
  updateTag(input: UpdateTagInput): Promise<TagLibraryItem>;
  deleteTag(name: string): Promise<{ success: boolean }>;
}
