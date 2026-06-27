import { Empty, Tag, Timeline } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import { formatMood } from '../../../shared/moods'
import PageHeader from '../../components/PageHeader'
import { buildWebPreviewData } from '../../utils/webPreviewDiaries'

const TIMELINE_LIMIT = 200
const TITLE_FALLBACK_LENGTH = 20
const SUMMARY_LENGTH = 180

type TimelineDiary = Diary & {
  markdown: string
}

type TimelineDayGroup = {
  key: string
  label: string
  diaries: TimelineDiary[]
}

type TimelineYearGroup = {
  key: string
  label: string
  days: TimelineDayGroup[]
}

let timelineDiaryCache: TimelineDiary[] | null = null

function TimelinePage() {
  const navigate = useNavigate()
  const cachedTimelineDiaries = timelineDiaryCache
  const [diaries, setDiaries] = useState<TimelineDiary[]>(() => cachedTimelineDiaries ?? [])
  const [isLoading, setIsLoading] = useState(!cachedTimelineDiaries)
  const [errorMessage, setErrorMessage] = useState('')

  const groupedDiaries = useMemo(() => {
    /*
     * 时光页先按年份分组，再按自然日合并同一天的多篇日记。
     */
    const sortedDiaries = [...diaries].sort((firstDiary, secondDiary) => {
      return secondDiary.createdAt - firstDiary.createdAt || secondDiary.updatedAt - firstDiary.updatedAt
    })
    const groups: TimelineYearGroup[] = []

    sortedDiaries.forEach(diary => {
      const yearKey = formatYearKey(diary.createdAt)
      const dayKey = formatDayKey(diary.createdAt)
      let yearGroup = groups.find(group => group.key === yearKey)

      if (!yearGroup) {
        yearGroup = {
          key: yearKey,
          label: formatYearLabel(diary.createdAt),
          days: []
        }
        groups.push(yearGroup)
      }

      let dayGroup = yearGroup.days.find(day => day.key === dayKey)

      if (!dayGroup) {
        dayGroup = {
          key: dayKey,
          label: formatDayLabel(diary.createdAt),
          diaries: []
        }
        yearGroup.days.push(dayGroup)
      }

      dayGroup.diaries.push(diary)
    })

    return groups
  }, [diaries])

  useEffect(() => {
    let cancelled = false

    const loadTimelineDiaries = async () => {
      const shouldShowLoading = !timelineDiaryCache

      if (shouldShowLoading) {
        setIsLoading(true)
      }

      setErrorMessage('')

      try {
        let nextDiaries: TimelineDiary[]

        if (!window.diaryAPI) {
          /*
           * Web 调试环境没有 Electron preload API，复用内存示例数据生成时光预览。
           */
          const previewData = buildWebPreviewData()
          nextDiaries = previewData.diaries.map(diary => ({
            ...diary,
            markdown: previewData.markdownById[diary.id] ?? ''
          }))
        } else {
          /*
           * 列表 API 只返回元数据；正文按 id 读取 Markdown 文件后在前端动态生成摘要。
           */
          const diaryList = await window.diaryAPI.getDiaryList({ limit: TIMELINE_LIMIT })
          const detailResults = await Promise.allSettled(diaryList.map(diary => window.diaryAPI.getDiaryById(diary.id)))

          if (cancelled) {
            return
          }

          const markdownById = new Map<string, string>()
          detailResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
              markdownById.set(result.value.id, result.value.markdown)
            }
          })

          nextDiaries = diaryList.map(diary => ({
            ...diary,
            markdown: markdownById.get(diary.id) ?? ''
          }))
        }

        if (!cancelled) {
          setDiaries(nextDiaries)
          timelineDiaryCache = nextDiaries
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load timeline diaries:', error)
          setErrorMessage(`读取时光失败：${getErrorMessage(error)}`)
        }
      } finally {
        if (!cancelled) {
          if (shouldShowLoading) {
            setIsLoading(false)
          }
        }
      }
    }

    void loadTimelineDiaries()

    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenDiary = (diaryId: string) => {
    navigate(`/preview/${diaryId}`)
  }

  return (
    <section className="flex h-full flex-col bg-page">
      <PageHeader
        eyebrow="Timeline"
        title="时光"
        extra={
          <>
            <span className="font-mono">{diaries.length}</span> 篇
          </>
        }
      />

      {errorMessage ? <p className="mx-48 mt-14 text-size-13 text-[#b42318]">{errorMessage}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto px-48 pb-56 pt-26">
        {isLoading ? <p className="grid min-h-320 place-items-center text-[rgba(25,28,29,0.62)]">正在读取时光...</p> : null}

        {!isLoading && diaries.length === 0 ? (
          <div className="echo-empty-muted grid min-h-320 place-items-center text-[rgba(25,28,29,0.62)]">
            <Empty description="还没有日记" />
          </div>
        ) : null}

        {!isLoading && groupedDiaries.length > 0 ? (
          <div className="max-w-880">
            {groupedDiaries.map(group => (
              <section key={group.key} className="[&+&]:mt-34">
                <h2 className="mb-24 font-mono text-size-24 text-black-85">{group.label}</h2>
                <Timeline
                  className="echo-timeline"
                  titleSpan="90px"
                  items={group.days.map(day => ({
                    key: day.key,
                    /*
                     * 每个日期只生成一条 Timeline，右侧集中展示当天全部内容。
                     */
                    title: (
                      <time className="whitespace-nowrap text-right font-mono text-size-18" dateTime={day.key}>
                        {day.label}
                      </time>
                    ),
                    content: (
                      <div className="flex flex-col gap-120">
                        {day.diaries.map(diary => (
                          <TimelineDiaryCard key={diary.id} diary={diary} onOpenDiary={handleOpenDiary} />
                        ))}
                      </div>
                    )
                  }))}
                />
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

type TimelineDiaryCardProps = {
  diary: TimelineDiary
  onOpenDiary: (diaryId: string) => void
}

function TimelineDiaryCard({ diary, onOpenDiary }: TimelineDiaryCardProps) {
  const plainText = markdownToPlainText(diary.markdown)
  const title = buildTimelineTitle(diary.title, plainText)
  const summary = truncateText(plainText, SUMMARY_LENGTH)

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    /*
     * Card 不是原生按钮，补齐 Enter/Space 键盘打开能力。
     */
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenDiary(diary.id)
    }
  }

  return (
    /*
     * 不使用 hoverable，避免 AntD 注入默认悬浮阴影。
     */
    // <Card
    //   className="rounded-xl!"
    //   role="button"
    //   tabIndex={0}
    //   aria-label={`打开日记：${title}`}
    //   onClick={() => onOpenDiary(diary.id)}
    //   onKeyDown={handleCardKeyDown}
    // >
    //   <h3>{title}</h3>
    //   <div>
    //     <time dateTime={new Date(diary.createdAt).toISOString()}>{formatCreatedTime(diary.createdAt)}</time>
    //     <span>{diary.mood ? formatMood(diary.mood)?.name : '🙂 未记录'}</span>
    //   </div>
    //   <p>{summary}</p>
    //   {diary.tags?.length ? (
    //     <div>
    //       {diary.tags.map(tag => (
    //         <Tag key={tag} variant="outlined" color="green">
    //           #{tag}
    //         </Tag>
    //       ))}
    //     </div>
    //   ) : null}
    // </Card>
    <div
      className="rounded-xl! group transition-[transform,border-color] duration-[160ms] ease-in-out focus-visible:outline-none"
      role="button"
      tabIndex={0}
      aria-label={`打开日记：${title}`}
      onKeyDown={handleCardKeyDown}
    >
      <h3
        className="mb-8 cursor-pointer text-size-20 leading-[1.35] text-foreground transition-all duration-[160ms] ease-in-out group-hover:text-primary group-focus-visible:text-primary"
        onClick={() => onOpenDiary(diary.id)}
      >
        {title}
      </h3>
      <div className="flex items-center gap-12 text-size-12 text-primary">
        <time className="font-mono text-[rgba(25,28,29,0.5)]" dateTime={new Date(diary.createdAt).toISOString()}>
          {formatCreatedTime(diary.createdAt)}
        </time>
        <span>{diary.mood ? formatMood(diary.mood)?.name : '🙂 未记录'}</span>
      </div>
      {summary ? <p className="mt-14 text-size-15 leading-[1.75] text-[rgba(25,28,29,0.72)]">{summary}</p> : null}
      {diary.tags?.length ? (
        <div className="echo-zero-tag-margin mt-16 flex flex-wrap gap-8">
          {diary.tags.map(tag => (
            <Tag key={tag} variant="outlined" color="green">
              #{tag}
            </Tag>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 从 Markdown 生成纯文本
 * 只在渲染层即时计算摘要，不写回数据库或 Markdown 文件。
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, codeBlock => codeBlock.replace(/```[^\n]*\n?|```/g, ' '))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~#]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 构建卡片标题
 * 标题为空时使用正文纯文本前 20 个字符兜底。
 */
function buildTimelineTitle(title: string, plainText: string): string {
  const normalizedTitle = title.trim()

  if (normalizedTitle) {
    return normalizedTitle
  }

  return truncateText(plainText || '未命名日记', TITLE_FALLBACK_LENGTH)
}

/**
 * 按字符截断文本
 * Array.from 能更自然地处理 emoji 和中文字符。
 */
function truncateText(text: string, maxLength: number): string {
  const chars = Array.from(text.trim())

  if (chars.length <= maxLength) {
    return chars.join('')
  }

  return `${chars.slice(0, maxLength).join('')}...`
}

/**
 * 格式化年份分组 key
 * 使用年份合并同一年的日记。
 */
function formatYearKey(timestamp: number): string {
  const date = new Date(timestamp)
  return String(date.getFullYear())
}

/**
 * 格式化日期分组 key
 * 使用 YYYY-MM-DD 合并同一天的日记。
 */
function formatDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 格式化年份标题
 * 时光页按年展示历史记录。
 */
function formatYearLabel(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}年`
}

/**
 * 格式化日期标题
 * 年份已在分组标题中展示，左侧只显示当天月日。
 */
function formatDayLabel(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${month}-${day}`
}

/**
 * 格式化卡片时间
 * 同一天多篇日记通过时分区分先后。
 */
function formatCreatedTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

/**
 * 获取错误信息文本
 * 将未知错误对象转换为可展示的用户提示。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '请稍后重试'
}

export default TimelinePage
