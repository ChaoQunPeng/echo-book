import type { ComponentPropsWithoutRef, CSSProperties, SyntheticEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Diary } from '../../../shared/diary'
import { formatMood } from '../../../shared/moods'
import { formatWeather } from '../../../shared/weather'

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
  const panelClassName = ['min-h-0 overflow-auto bg-white', className].filter(Boolean).join(' ')

  return (
    <section className={panelClassName} aria-label={ariaLabel}>
      {diary ? (
        <article className="min-h-full px-40 pb-48 pt-32">
          <div className="mb-30 border-b border-[rgba(25,28,29,0.08)] pb-20">
            <h2 className="mt-8 text-size-28 leading-[1.25] text-color-base">{diary.title}</h2>
            <div className="mt-12 flex flex-wrap gap-x-14 gap-y-8 text-size-13 text-[rgba(25,28,29,0.58)]">
              <p className="font-bold text-primary">{formatFullCreatedAt(diary.createdAt)}</p>
              {diary.mood ? <span>心情：{formatMood(diary.mood)?.name ?? diary.mood}</span> : null}
              {diary.weather ? <span>天气：{formatWeather(diary.weather)?.name ?? diary.weather}</span> : null}
              {diary.tags?.length ? <span>标签：{diary.tags.join(' / ')}</span> : null}
            </div>
          </div>
          <div className="echo-diary-preview-content text-size-16 leading-[1.9] text-color-base-85">
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
                {markdown}
              </ReactMarkdown>
            ) : null}
          </div>
        </article>
      ) : (
        <div className="grid h-full min-h-280 place-items-center content-center gap-8 text-center text-[rgba(25,28,29,0.62)]">
          <h2 className="text-size-18 text-color-base">{loading ? '正在读取日记' : emptyTitle}</h2>
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
