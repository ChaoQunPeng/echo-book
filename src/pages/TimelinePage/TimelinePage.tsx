import { ClockCircleOutlined } from '@ant-design/icons'
import { Card, Empty, Tag, Timeline } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import { formatMoodLabel } from '../../../shared/moods'
import { buildWebPreviewData } from '../../utils/webPreviewDiaries'
import styles from './TimelinePage.module.scss'

const TIMELINE_LIMIT = 200
const TITLE_FALLBACK_LENGTH = 20
const SUMMARY_LENGTH = 180

type TimelineDiary = Diary & {
  markdown: string
}

function TimelinePage() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<TimelineDiary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const groupedDiaries = useMemo(() => {
    /*
     * 时光页以创建月份分组，组内继续保持创建时间倒序。
     */
    const sortedDiaries = [...diaries].sort((firstDiary, secondDiary) => {
      return secondDiary.createdAt - firstDiary.createdAt || secondDiary.updatedAt - firstDiary.updatedAt
    })
    const groups: Array<{ key: string; label: string; diaries: TimelineDiary[] }> = []

    sortedDiaries.forEach(diary => {
      const key = formatMonthKey(diary.createdAt)
      const existingGroup = groups.find(group => group.key === key)

      if (existingGroup) {
        existingGroup.diaries.push(diary)
        return
      }

      groups.push({
        key,
        label: formatMonthLabel(diary.createdAt),
        diaries: [diary]
      })
    })

    return groups
  }, [diaries])

  useEffect(() => {
    let cancelled = false

    const loadTimelineDiaries = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        if (!window.diaryAPI) {
          /*
           * Web 调试环境没有 Electron preload API，复用内存示例数据生成时光预览。
           */
          const previewData = buildWebPreviewData()
          const previewDiaries = previewData.diaries.map(diary => ({
            ...diary,
            markdown: previewData.markdownById[diary.id] ?? ''
          }))

          if (!cancelled) {
            setDiaries(previewDiaries)
          }

          return
        }

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

        setDiaries(
          diaryList.map(diary => ({
            ...diary,
            markdown: markdownById.get(diary.id) ?? ''
          }))
        )
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load timeline diaries:', error)
          setErrorMessage(`读取时光失败：${getErrorMessage(error)}`)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadTimelineDiaries()

    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenDiary = (diaryId: string) => {
    navigate(`/editor/${diaryId}`)
  }

  return (
    <section className={styles.timelinePage}>
      <div className={styles.timelineHeader}>
        <div>
          <p>Timeline</p>
          <h1>时光</h1>
        </div>
        <span>{diaries.length} 篇</span>
      </div>

      {errorMessage ? <p className={styles.timelineError}>{errorMessage}</p> : null}

      <div className={styles.timelineScrollArea}>
        {isLoading ? <p className={styles.timelineLoading}>正在读取时光...</p> : null}

        {!isLoading && diaries.length === 0 ? (
          <div className={styles.timelineEmpty}>
            <Empty description="还没有日记" />
          </div>
        ) : null}

        {!isLoading && groupedDiaries.length > 0 ? (
          <div className={styles.timelineGroups}>
            {groupedDiaries.map(group => (
              <section key={group.key} className={styles.timelineGroup}>
                <h2>{group.label}</h2>
                <Timeline
                  className={styles.timeline}
                  titleSpan={100}
                  items={group.diaries.map(diary => ({
                    children: <TimelineDiaryCard diary={diary} onOpenDiary={handleOpenDiary} />
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
  const summary = truncateText(plainText || '没有正文预览', SUMMARY_LENGTH)

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
    <Card
      className={`${styles.timelineCard} rounded-xl!`}
      role="button"
      tabIndex={0}
      aria-label={`打开日记：${title}`}
      onClick={() => onOpenDiary(diary.id)}
      onKeyDown={handleCardKeyDown}
    >
      <h3>{title}</h3>
      <div className="flex items-center">
        <time className="mr-12" dateTime={new Date(diary.createdAt).toISOString()}>
          {formatCreatedAt(diary.createdAt)}
        </time>
        <span className={styles.timelineCardMood}>{diary.mood ? formatMoodLabel(diary.mood) : '🙂 未记录'}</span>
      </div>
      <p>{summary}</p>
      {diary.tags?.length ? (
        <div className={styles.timelineTags}>
          {diary.tags.map(tag => (
            <Tag key={tag} bordered={false} color="green">
              {tag}
            </Tag>
          ))}
        </div>
      ) : null}
    </Card>
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
 * 格式化月份分组 key
 * 使用 YYYY-MM 保持排序和分组稳定。
 */
function formatMonthKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

/**
 * 格式化月份标题
 * 时光页按年月展示历史记录。
 */
function formatMonthLabel(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

/**
 * 格式化卡片创建时间
 * 同一天多篇日记通过时分区分。
 */
function formatCreatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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
