import type { ComponentPropsWithoutRef, CSSProperties, SyntheticEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Diary } from '../../../shared/diary'
import { formatMood } from '../../../shared/moods'
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
          <div className={`${styles.diaryPreviewHeader} mb-30`}>
            <h2>{diary.title}</h2>
            <div className={styles.diaryPreviewMeta}>
              <p>{formatFullCreatedAt(diary.createdAt)}</p>
              {/* <span>更新：{formatUpdatedAt(diary.updatedAt)}</span> */}
              {diary.mood ? <span>心情：{formatMood(diary.mood)?.name}</span> : null}
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

function DiaryPreviewImage({ diaryId, src = '', alt = '', title = '', onLoad, style, ...props }: DiaryPreviewImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const imageRatio = useMemo(() => parseMilkdownImageRatio(alt), [alt])
  const imageWidth = useMemo(() => parseDiaryImageWidthTitle(title), [title])

  const applyMilkdownImageRatio = useCallback(() => {
    /*
     * Milkdown 图片块把高度缩放比例保存在 alt 中，预览页需要复用这个比例。
     */
    const image = imageRef.current
    if (!image || imageRatio === null) {
      return
    }

    const hostWidth = image.parentElement?.getBoundingClientRect().width ?? image.clientWidth
    if (!hostWidth || !image.naturalWidth || !image.naturalHeight) {
      return
    }

    const baseHeight = image.naturalWidth < hostWidth ? image.naturalHeight : hostWidth * (image.naturalHeight / image.naturalWidth)
    image.style.height = `${(baseHeight * imageRatio).toFixed(2)}px`
  }, [imageRatio])

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

  useEffect(() => {
    if (imageRatio === null) {
      return
    }

    /*
     * 预览容器宽度变化时，按新的最大宽度重新计算图片高度。
     */
    window.addEventListener('resize', applyMilkdownImageRatio)

    return () => {
      window.removeEventListener('resize', applyMilkdownImageRatio)
    }
  }, [applyMilkdownImageRatio, imageRatio])

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    onLoad?.(event)
    applyMilkdownImageRatio()
  }

  const previewImageStyle: CSSProperties = {
    ...style,
    ...(imageWidth === null
      ? null
      : {
          display: 'block',
          width: imageWidth,
          maxWidth: '100%',
          height: 'auto'
        }),
    ...(imageRatio === null
      ? null
      : {
          display: 'block',
          maxWidth: '100%',
          objectFit: 'cover'
        })
  }

  return (
    <img
      {...props}
      ref={imageRef}
      src={resolvedSrc}
      alt={imageRatio === null ? alt : ''}
      title={imageWidth === null ? title : undefined}
      style={previewImageStyle}
      onLoad={handleImageLoad}
    />
  )
}

function isDiaryAssetPath(url: string): boolean {
  /*
   * 只解析当前日记目录的 assets 图片，外链或 data URL 继续交给浏览器处理。
   */
  return /^assets\/[^/]+$/.test(url.trim())
}

function parseMilkdownImageRatio(alt: string): number | null {
  /*
   * Crepe image-block 的 Markdown 形态是 ![ratio](src "caption")。
   * 普通图片的 alt 文本不是数字时，继续按常规 Markdown 图片处理。
   */
  const ratio = Number(alt)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

function parseDiaryImageWidthTitle(title: string | undefined): number | null {
  /*
   * Tiptap 编辑器把图片宽度存在 Markdown title 中，预览时再转成样式。
   */
  const widthPrefix = 'echo-width:'

  if (!title?.startsWith(widthPrefix)) {
    return null
  }

  const width = Number(title.slice(widthPrefix.length))

  return Number.isFinite(width) && width > 0 ? Math.round(width) : null
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
