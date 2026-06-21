import type { ComponentPropsWithoutRef } from 'react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Diary } from '../../../shared/diary'
import { formatMoodLabel } from '../../../shared/moods'
import styles from './DiaryPreview.module.scss'

type DiaryPreviewProps = {
  diary: Diary | null
  markdown: string
  loading?: boolean
  errorMessage?: string
  className?: string
  ariaLabel?: string
  emptyTitle?: string
  emptyDescription?: string
}

function DiaryPreview({
  diary,
  markdown,
  loading = false,
  errorMessage = '',
  className = '',
  ariaLabel = '日记内容预览',
  emptyTitle = '选择一篇日记',
  emptyDescription = '选中后，这里会展示对应内容。'
}: DiaryPreviewProps) {
  const panelClassName = className ? `${styles.diaryPreview} ${className}` : styles.diaryPreview

  return (
    <section className={`${panelClassName} bg-white`} aria-label={ariaLabel}>
      {diary ? (
        <article className={styles.diaryPreviewArticle}>
          <div className={styles.diaryPreviewHeader}>
            <h2>{diary.title}</h2>
            <div className={styles.diaryPreviewMeta}>
              <p>{formatFullCreatedAt(diary.createdAt)}</p>
              {/* <span>更新：{formatUpdatedAt(diary.updatedAt)}</span> */}
              {diary.mood ? <span>心情：{formatMoodLabel(diary.mood)}</span> : null}
              {diary.tags?.length ? <span>标签：{diary.tags.join(' / ')}</span> : null}
            </div>
          </div>
          <div className={styles.diaryPreviewContent}>
            {/*
             * Markdown 正文统一在这里渲染，调用方只负责传入日记和正文内容。
             */}
            {loading ? <p>正在读取正文...</p> : null}
            {!loading && errorMessage ? <p>{errorMessage}</p> : null}
            {!loading && !errorMessage ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: imageProps => <DiaryPreviewImage diaryId={diary.id} {...imageProps} />
                }}
              >
                {markdown || '没有正文预览'}
              </ReactMarkdown>
            ) : null}
          </div>
        </article>
      ) : (
        <div className={styles.diaryPreviewEmpty}>
          <h2>{loading ? '正在读取日记' : emptyTitle}</h2>
          <p>{loading ? '请稍等，正在准备预览内容。' : errorMessage || emptyDescription}</p>
        </div>
      )}
    </section>
  )
}

type DiaryPreviewImageProps = ComponentPropsWithoutRef<'img'> & {
  diaryId: string
}

function DiaryPreviewImage({ diaryId, src = '', alt = '', ...props }: DiaryPreviewImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src)

  useEffect(() => {
    let cancelled = false

    /*
     * Markdown 中保留 assets/xxx 相对路径；预览时再通过 IPC 读取成 data URL。
     */
    if (!src || !isDiaryAssetPath(src) || !window.diaryAPI) {
      setResolvedSrc(src)
      return () => {
        cancelled = true
      }
    }

    window.diaryAPI
      .getDiaryAssetDataUrl({
        diaryId,
        relativePath: src
      })
      .then(dataUrl => {
        if (!cancelled) {
          setResolvedSrc(dataUrl)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(src)
        }
      })

    return () => {
      cancelled = true
    }
  }, [diaryId, src])

  return <img {...props} src={resolvedSrc} alt={alt} />
}

function isDiaryAssetPath(url: string): boolean {
  /*
   * 只解析当前日记目录的 assets 图片，外链或 data URL 继续交给浏览器处理。
   */
  return /^assets\/[^/]+$/.test(url.trim())
}

/**
 * 格式化完整创建时间
 * 预览组件需要展示更完整的创建时间上下文。
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

export default DiaryPreview
