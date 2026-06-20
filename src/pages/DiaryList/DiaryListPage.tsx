import { PlusOutlined } from '@ant-design/icons'
import { App as AntdApp, Empty } from 'antd'
import type { MenuProps } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import EchoButton from '../../components/EchoButton'
import { createDefaultDiary } from '../../utils/diaryCreation'
import DiaryListPanel from './DiaryListPanel'
import styles from './DiaryListPage.module.scss'
import DiaryPreviewPanel from './DiaryPreviewPanel'
import type { DateFilterValue } from './types'

const DATE_FILTER_OPTIONS: Array<{ value: DateFilterValue; label: string }> = [
  { value: 'all', label: '全部日记' },
  { value: 'last7', label: '最近 7 天' },
  { value: 'last30', label: '最近 30 天' },
  { value: 'thisYear', label: '今年' }
]

/*
 * Dropdown 菜单 key 直接复用筛选值，避免菜单和筛选状态维护两套映射。
 */
const DATE_FILTER_MENU_ITEMS: MenuProps['items'] = DATE_FILTER_OPTIONS.map(option => ({
  key: option.value,
  label: option.label
}))

const WEB_PREVIEW_DIARY_ID_PREFIX = 'web-preview-diary'

function DiaryListPage() {
  const navigate = useNavigate()
  const { modal } = AntdApp.useApp()
  const [diaries, setDiaries] = useState<Diary[]>([])
  const [selectedDiaryId, setSelectedDiaryId] = useState('')
  const [selectedDiaryMarkdown, setSelectedDiaryMarkdown] = useState('')
  const [webPreviewMarkdownById, setWebPreviewMarkdownById] = useState<Record<string, string>>({})
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isCreatingDiary, setIsCreatingDiary] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [previewErrorMessage, setPreviewErrorMessage] = useState('')
  const currentDateFilterLabel = DATE_FILTER_OPTIONS.find(option => option.value === dateFilter)?.label ?? '全部日记'

  const filteredDiaries = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase()

    /*
     * diaryDate 暂时不在界面使用，列表展示统一按 createdAt 倒序处理。
     */
    return [...diaries]
      .filter(diary => {
        const matchesTitle = keyword ? diary.title.toLocaleLowerCase().includes(keyword) : true
        return matchesTitle && isDiaryInDateFilter(diary, dateFilter)
      })
      .sort((firstDiary, secondDiary) => {
        return secondDiary.createdAt - firstDiary.createdAt || secondDiary.updatedAt - firstDiary.updatedAt
      })
  }, [dateFilter, diaries, searchKeyword])

  const selectedDiary = useMemo(() => {
    return filteredDiaries.find(diary => diary.id === selectedDiaryId) ?? null
  }, [filteredDiaries, selectedDiaryId])

  /**
   * 加载日记列表数据
   * 从本地数据库读取最近的日记记录并更新页面状态
   */
  const loadDiaries = async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      if (!window.diaryAPI) {
        /*
         * 纯 Web 调试环境没有 Electron preload API。
         * 这里给一组内存示例数据，让布局、搜索和预览都能正常展示。
         */
        const previewData = buildWebPreviewData()
        setDiaries(previewData.diaries)
        setWebPreviewMarkdownById(previewData.markdownById)
        return
      }

      /*
       * 列表页先取最近 100 条，满足当前轻量日记场景。
       * 后续做无限滚动或搜索时，可以在这里继续使用 limit/offset 扩展。
       */
      const diaryList = await window.diaryAPI.getDiaryList({ limit: 100 })
      setDiaries(diaryList)
      setWebPreviewMarkdownById({})
    } catch (error) {
      console.error('Failed to load diary list:', error)
      setErrorMessage(`读取日记列表失败：${getErrorMessage(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDiaries()
  }, [])

  useEffect(() => {
    /*
     * 搜索或筛选后如果当前选中项不可见，自动选中第一条结果。
     * 没有结果时清空右侧预览，避免展示和左侧列表不一致的内容。
     */
    setSelectedDiaryId(currentDiaryId => {
      if (filteredDiaries.length === 0) {
        return ''
      }

      return filteredDiaries.some(diary => diary.id === currentDiaryId) ? currentDiaryId : filteredDiaries[0].id
    })
  }, [filteredDiaries])

  useEffect(() => {
    let cancelled = false

    if (!selectedDiary) {
      setSelectedDiaryMarkdown('')
      setPreviewErrorMessage('')
      setIsPreviewLoading(false)
      return () => {
        cancelled = true
      }
    }

    setPreviewErrorMessage('')

    if (!window.diaryAPI) {
      /*
       * Web 预览没有真实 Markdown 文件，正文从内存映射读取。
       * Diary 列表对象仍然只保存元信息，不携带正文。
       */
      setSelectedDiaryMarkdown(webPreviewMarkdownById[selectedDiary.id] ?? '')
      setIsPreviewLoading(false)
      return () => {
        cancelled = true
      }
    }

    setIsPreviewLoading(true)
    setSelectedDiaryMarkdown('')

    window.diaryAPI
      .getDiaryById(selectedDiary.id)
      .then(diary => {
        if (cancelled) {
          return
        }

        if (!diary) {
          setPreviewErrorMessage('没有找到这篇日记')
          return
        }

        setSelectedDiaryMarkdown(diary.markdown)
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewErrorMessage('读取日记正文失败')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedDiary, webPreviewMarkdownById])

  const handleCreateDiary = async () => {
    /*
     * 创建按钮现在直接写入一条默认日记，再跳转到该日记的编辑页。
     */
    if (isCreatingDiary) {
      return
    }

    setErrorMessage('')
    setIsCreatingDiary(true)

    try {
      const createdDiary = await createDefaultDiary()
      navigate(`/editor/${createdDiary.id}`)
    } catch (error) {
      setErrorMessage(`创建日记失败：${getErrorMessage(error)}`)
    } finally {
      setIsCreatingDiary(false)
    }
  }

  /**
   * 删除指定日记
   * 弹出确认框，确认后执行软删除并刷新列表
   */
  const handleDeleteDiary = (diary: Diary) => {
    /*
     * 删除当前走软删除，使用 App 上下文里的 modal 承载主题和二次确认。
     */
    modal.confirm({
      title: '删除日记',
      content: `确认删除「${diary.title}」吗？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (!window.diaryAPI) {
            /*
             * Web 预览数据只存在于 React state。
             * 删除时直接从当前列表移除，避免调用 Electron IPC。
             */
            setDiaries(currentDiaries => currentDiaries.filter(currentDiary => currentDiary.id !== diary.id))
            setWebPreviewMarkdownById(currentMarkdownById => {
              const nextMarkdownById = { ...currentMarkdownById }
              delete nextMarkdownById[diary.id]
              return nextMarkdownById
            })
            return
          }

          await window.diaryAPI.deleteDiary(diary.id)
          await loadDiaries()
        } catch {
          setErrorMessage('删除日记失败')
        }
      }
    })
  }

  /*
   * 日记列表页是应用打开后的默认页面。
   * 列表页只负责查询、跳转和删除，具体正文编辑留给 EditorPage 处理。
   */
  return (
    <section className={styles.diaryListPage}>
      {errorMessage ? <p className={styles.diaryListPageError}>{errorMessage}</p> : null}

      <div className={styles.diaryListPageContent}>
        {isLoading ? <p className={styles.diaryListPageEmpty}>正在读取日记...</p> : null}

        {!isLoading && diaries.length === 0 ? (
          <div className={styles.diaryListPageEmptyState}>
            {/*
             * 空列表使用 antd Empty 统一缺省图和描述，按钮保留在中间主操作位。
             */}
            <Empty description="还没有日记">
              <EchoButton icon={<PlusOutlined />} loading={isCreatingDiary} onClick={handleCreateDiary}>
                写第一篇
              </EchoButton>
            </Empty>
          </div>
        ) : null}

        {!isLoading && diaries.length > 0 ? (
          <div className={styles.diarySplitLayout}>
            <DiaryListPanel
              dateFilter={dateFilter}
              dateFilterMenuItems={DATE_FILTER_MENU_ITEMS}
              diaries={filteredDiaries}
              currentDateFilterLabel={currentDateFilterLabel}
              searchKeyword={searchKeyword}
              selectedDiaryId={selectedDiaryId}
              onDateFilterChange={setDateFilter}
              onDeleteDiary={handleDeleteDiary}
              onEditDiary={diary => navigate(`/editor/${diary.id}`)}
              onSearchKeywordChange={setSearchKeyword}
              onSelectDiary={setSelectedDiaryId}
            />

            <DiaryPreviewPanel
              selectedDiary={selectedDiary}
              selectedDiaryMarkdown={selectedDiaryMarkdown}
              isPreviewLoading={isPreviewLoading}
              previewErrorMessage={previewErrorMessage}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}

/**
 * 获取错误信息文本
 * 将未知错误对象转换为可展示的用户提示
 */
function getErrorMessage(error: unknown): string {
  /*
   * IPC 抛错会被 Electron 序列化成 Error；这里做最小格式化，
   * 让页面能显示真正原因，而不是只给一个模糊失败态。
   */
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '请确认通过 Electron 启动应用'
}

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
function buildWebPreviewData(): { diaries: Diary[]; markdownById: Record<string, string> } {
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
 * 判断日记是否符合创建时间筛选
 * 使用 createdAt 做筛选，和列表分组排序保持同一时间维度
 */
function isDiaryInDateFilter(diary: Diary, filter: DateFilterValue): boolean {
  const createdDate = new Date(diary.createdAt)
  const todayStart = new Date()

  todayStart.setHours(0, 0, 0, 0)

  if (filter === 'last7') {
    return diary.createdAt >= todayStart.getTime() - 6 * 24 * 60 * 60 * 1000
  }

  if (filter === 'last30') {
    return diary.createdAt >= todayStart.getTime() - 29 * 24 * 60 * 60 * 1000
  }

  if (filter === 'thisYear') {
    return createdDate.getFullYear() === todayStart.getFullYear()
  }

  return true
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

export default DiaryListPage
