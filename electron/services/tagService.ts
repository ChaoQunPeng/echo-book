import type { CreateTagInput, TagLibraryItem, UpdateTagInput } from "../../shared/tags.js";
import type { TagRepository } from "../repositories/tagRepository.js";

const DEFAULT_TAG_COLOR = "#237804";

/**
 * 标签库 service 负责输入校验，repository 只负责 SQL。
 */
export class TagService {
  public constructor(private readonly tagRepository: TagRepository) {}

  public getTagLibrary(): TagLibraryItem[] {
    return this.tagRepository.listTags();
  }

  public createTag(input: CreateTagInput): TagLibraryItem {
    return this.tagRepository.createTag(normalizeTagName(input.name), normalizeTagColor(input.color));
  }

  public updateTag(input: UpdateTagInput): TagLibraryItem {
    const oldName = normalizeTagName(input.oldName);
    const name = normalizeTagName(input.name);
    const color = normalizeTagColor(input.color);

    if (oldName === name) {
      return this.tagRepository.updateTag(oldName, name, color) ?? this.tagRepository.createTag(name, color);
    }

    const updatedTag = this.tagRepository.updateTag(oldName, name, color);
    if (!updatedTag) {
      throw new Error(`Tag not found: ${oldName}`);
    }

    return updatedTag;
  }

  public deleteTag(name: string): { success: boolean } {
    return {
      success: this.tagRepository.deleteTag(normalizeTagName(name)),
    };
  }
}

export function normalizeTagNames(tags: string[] | undefined): string[] {
  /*
   * 标签按文本去重；日记保存和标签库 upsert 共用这套规则。
   */
  if (tags === undefined) {
    return [];
  }

  if (!Array.isArray(tags)) {
    throw new Error("tags must be an array of strings.");
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => {
          if (typeof tag !== "string") {
            throw new Error("tags must be an array of strings.");
          }

          return normalizeTagName(tag);
        })
        .filter(Boolean),
    ),
  );
}

function normalizeTagName(name: string): string {
  if (typeof name !== "string") {
    throw new Error("tag name must be a string.");
  }

  const normalized = name.trim();
  if (!normalized) {
    throw new Error("tag name cannot be empty.");
  }

  return normalized;
}

function normalizeTagColor(color: string): string {
  /*
   * 颜色只接受标准 6 位 hex，避免任意样式字符串进入 renderer。
   */
  if (typeof color !== "string") {
    return DEFAULT_TAG_COLOR;
  }

  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_TAG_COLOR;
}
