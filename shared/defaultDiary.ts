/*
 * 默认日记内容用于“点击创建即落库”的入口。
 * 标题和正文都保持非空，满足 main process 的创建校验。
 */
export const CLEARED_DIARY_TITLE_FALLBACK = "这一天";

/*
 * 新建日记仍然按创建时间生成标题，清空标题时才使用固定兜底名。
 */
export const DEFAULT_DIARY_TITLE_PREFIX = "";
