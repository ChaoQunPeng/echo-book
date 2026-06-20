import type { Diary } from '../../shared/diary'

const WEB_PREVIEW_DIARY_ID_PREFIX = 'web-preview-diary'

/**
 * 构建 Web 预览日记
 * 补齐 Diary 类型需要的固定字段
 */
function createWebPreviewDiary(input: { id: string; title: string; markdown: string; createdAt: number; tags?: string[]; mood?: string }): {
  diary: Diary
  markdown: string
} {
  return {
    diary: {
      id: input.id,
      title: input.title,
      filepath: '',
      diaryDate: formatCreatedDateKey(input.createdAt),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      tags: input.tags,
      mood: input.mood,
      deleted: false
    },
    markdown: input.markdown
  }
}

/**
 * 构建 Web 预览数据
 * 只在没有 Electron API 时使用，避免开发态页面空白或报错
 */
export function buildWebPreviewData(): { diaries: Diary[]; markdownById: Record<string, string> } {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  const previewDiaries = [
    createWebPreviewDiary({
      id: `${WEB_PREVIEW_DIARY_ID_PREFIX}-today`,
      title: '整理书桌后的下午',
      markdown: `# 整理书桌后的下午

把桌面上散落的便签、旧笔和几张票根重新收好，空间一下子轻了很多。

今天最明显的感受是：当眼前的东西变少，脑子里的声音也会变小。晚上想继续把这份清爽留给明天。`,
      createdAt: now,
      tags: ['生活', '整理'],
      mood: '平静'
    }),
    createWebPreviewDiary({
      id: `${WEB_PREVIEW_DIARY_ID_PREFIX}-yesterday`,
      title: '雨后散步',
      markdown: `# 雨后散步

下班后雨停了，路面还亮着。沿着小区外的小路走了一圈，没有刻意听什么播客，只是让脚步自己往前。

回来时想起一句话：有些答案不是想出来的，是走出来的。`,
      createdAt: now - dayMs,
      tags: ['散步'],
      mood: '松弛'
    }),
    createWebPreviewDiary({
      id: `${WEB_PREVIEW_DIARY_ID_PREFIX}-last-week`,
      title: '周末读书记录',
      markdown: `# 周末读书记录

读完了两章，做了几条摘记。比起追求速度，今天更想把真正有触动的句子留下来。

- 先记录问题
- 再记录答案
- 最后记录自己的变化`,
      createdAt: now - 8 * dayMs,
      tags: ['阅读', '记录']
    })
  ]

  /*
   * Web 预览没有文件系统，这里用独立映射模拟“按 id 读取 Markdown 文件”的结果。
   */
  return {
    diaries: previewDiaries.map(previewDiary => previewDiary.diary),
    markdownById: Object.fromEntries(previewDiaries.map(previewDiary => [previewDiary.diary.id, previewDiary.markdown]))
  }
}

/**
 * 格式化创建日期分组 key
 * 返回 YYYY-MM-DD，避免同一天被重复分组
 */
function formatCreatedDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
