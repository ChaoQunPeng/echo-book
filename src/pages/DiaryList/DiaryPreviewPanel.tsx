import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Diary } from '../../../shared/diary'
import styles from './DiaryListPage.module.scss'

type DiaryPreviewPanelProps = {
  selectedDiary: Diary | null
  selectedDiaryMarkdown: string
  isPreviewLoading: boolean
  previewErrorMessage: string
}

function DiaryPreviewPanel({
  selectedDiary,
  selectedDiaryMarkdown,
  isPreviewLoading,
  previewErrorMessage
}: DiaryPreviewPanelProps) {
  return (
    <section className={styles.diaryPreviewPanel} aria-label="日记内容预览">
      {selectedDiary ? (
        <article className={styles.diaryPreviewArticle}>
          <div className={styles.diaryPreviewHeader}>
            <p>{formatFullCreatedAt(selectedDiary.createdAt)}</p>
            <h2>{selectedDiary.title}</h2>
            <div className={styles.diaryPreviewMeta}>
              <span>{selectedDiary.diaryDate}</span>
              <span>更新：{formatUpdatedAt(selectedDiary.updatedAt)}</span>
              {selectedDiary.mood ? <span>心情：{selectedDiary.mood}</span> : null}
              {selectedDiary.tags?.length ? <span>标签：{selectedDiary.tags.join(' / ')}</span> : null}
            </div>
          </div>
          <div className={styles.diaryPreviewContent}>
            {/*
             * 右侧预览使用 Markdown 渲染，remark-gfm 负责表格、任务列表等 GFM 扩展。
             */}
            {isPreviewLoading ? <p>正在读取正文...</p> : null}
            {!isPreviewLoading && previewErrorMessage ? <p>{previewErrorMessage}</p> : null}
            {!isPreviewLoading && !previewErrorMessage ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDiaryMarkdown || '没有正文预览'}</ReactMarkdown>
            ) : null}
          </div>
        </article>
      ) : (
        <div className={styles.diaryPreviewEmpty}>
          <h2>选择一篇日记</h2>
          <p>左侧选中后，这里会展示对应内容。</p>
        </div>
      )}
    </section>
  )
}

/**
 * 格式化完整创建时间
 * 右侧预览需要展示更完整的创建时间上下文
 */
function formatFullCreatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

/**
 * 格式化更新时间
 * 将时间戳转换为预览区展示的日期时间格式
 */
function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

export default DiaryPreviewPanel
