import { DeleteOutlined, EditOutlined, FilterOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Dropdown, Input, Modal } from 'antd'
import type { MenuProps } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import type { Diary } from '../../shared/diary'
import EchoButton from '../components/EchoButton'
import styles from './DiaryListPage.module.scss'

const DEFAULT_NEW_DIARY_MARKDOWN = `# 今天的回声

写下今天值得被记住的片段。

- 发生了什么？
- 我当时有什么感受？
- 明天想带着什么继续出发？
`

type DateFilterValue = 'all' | 'last7' | 'last30' | 'thisYear'

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
  const [diaries, setDiaries] = useState<Diary[]>([])
  const [selectedDiaryId, setSelectedDiaryId] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const currentDateFilterLabel = DATE_FILTER_OPTIONS.find(option => option.value === dateFilter)?.label ?? '全部日记'

  const filteredDiaries = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase()

    /*
     * 列表展示统一在前端按 createdAt 倒序处理。
     * 这样即使后端默认按 diaryDate 返回，用户看到的仍是创建时间顺序。
     */
    return [...diaries]
      .filter(diary => {
        const matchesTitle = keyword ? diary.title.toLocaleLowerCase().includes(keyword) : true
        return matchesTitle && isDiaryInDateFilter(diary, dateFilter)
      })
      .sort((firstDiary, secondDiary) => secondDiary.createdAt - firstDiary.createdAt)
  }, [dateFilter, diaries, searchKeyword])

  const groupedDiaries = useMemo(() => {
    /*
     * 分组 key 使用本地日期，展示 label 保持中文可读。
     * filteredDiaries 已经排好序，因此这里按顺序追加即可。
     */
    const groups: Array<{ key: string; label: string; diaries: Diary[] }> = []

    filteredDiaries.forEach(diary => {
      const groupKey = formatCreatedDateKey(diary.createdAt)
      const existingGroup = groups.find(group => group.key === groupKey)

      if (existingGroup) {
        existingGroup.diaries.push(diary)
        return
      }

      groups.push({
        key: groupKey,
        label: formatCreatedDateGroup(diary.createdAt),
        diaries: [diary]
      })
    })

    return groups
  }, [filteredDiaries])

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
        setDiaries(buildWebPreviewDiaries())
        return
      }

      /*
       * 列表页先取最近 100 条，满足当前轻量日记场景。
       * 后续做无限滚动或搜索时，可以在这里继续使用 limit/offset 扩展。
       */
      const diaryList = await window.diaryAPI.getDiaryList({ limit: 100 })
      setDiaries(diaryList)
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

  /**
   * 创建新日记
   * 创建默认内容的日记并跳转到编辑页面
   */
  const handleCreateDiary = async () => {
    setIsCreating(true)
    setErrorMessage('')

    try {
      if (!window.diaryAPI) {
        /*
         * Web 预览下没有数据库，新增日记只写入当前页面内存。
         * 这样按钮不会报错，刷新页面后仍回到示例数据。
         */
        const createdAt = Date.now()
        const diary = createWebPreviewDiary({
          id: `${WEB_PREVIEW_DIARY_ID_PREFIX}-${createdAt}`,
          title: '未命名日记',
          content: DEFAULT_NEW_DIARY_MARKDOWN,
          createdAt,
          tags: ['Web 预览']
        })

        setDiaries(currentDiaries => [diary, ...currentDiaries])
        setSelectedDiaryId(diary.id)
        return
      }

      /*
       * “新建日记 / 写第一篇”现在立即创建真实日记，而不是只进入本地草稿页。
       * 这样用户点完新建后，列表数据和 notes 下的 Markdown 文件都会立刻存在。
       */
      const diary = await window.diaryAPI.createDiary({
        title: '未命名日记',
        content: DEFAULT_NEW_DIARY_MARKDOWN,
        diaryDate: getTodayDateString()
      })

      navigate(`/editor/${diary.id}`)
    } catch (error) {
      console.error('Failed to create diary from list:', error)
      setErrorMessage(`新建日记失败：${getErrorMessage(error)}`)
    } finally {
      setIsCreating(false)
    }
  }

  /**
   * 删除指定日记
   * 弹出确认框，确认后执行软删除并刷新列表
   */
  const handleDeleteDiary = (diary: Diary) => {
    /*
     * 删除当前走软删除，使用 antd 确认弹窗承载二次确认和按钮样式。
     */
    Modal.confirm({
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
            <h2>还没有日记</h2>
            <p>从一篇新的记录开始。</p>
            <EchoButton icon={<PlusOutlined />} disabled={isCreating} onClick={handleCreateDiary}>
              {isCreating ? '新建中' : '写第一篇'}
            </EchoButton>
          </div>
        ) : null}

        {!isLoading && diaries.length > 0 ? (
          <div className={styles.diarySplitLayout}>
            <aside className={styles.diaryListPanel}>
              <div className={styles.diaryListToolbar}>
                <Input
                  allowClear
                  variant="borderless"
                  prefix={<SearchOutlined />}
                  placeholder="搜索日记标题"
                  value={searchKeyword}
                  onChange={event => setSearchKeyword(event.target.value)}
                />
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: DATE_FILTER_MENU_ITEMS,
                    selectedKeys: [dateFilter],
                    onClick: ({ key }) => setDateFilter(key as DateFilterValue)
                  }}
                  placement="bottomRight"
                >
                  <FilterOutlined
                    className={styles.diaryDateFilterIcon}
                    role="button"
                    tabIndex={0}
                    aria-label={`按创建时间筛选，当前：${currentDateFilterLabel}`}
                    onKeyDown={event => {
                      /*
                       * 图标不是原生按钮，手动补齐键盘触发能力。
                       */
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.currentTarget.click()
                      }
                    }}
                  />
                </Dropdown>
              </div>

              <div className={styles.diaryListScrollArea}>
                {groupedDiaries.length === 0 ? (
                  <div className={styles.diaryListNoResult}>
                    <h2>没有匹配的日记</h2>
                    <p>换个标题关键词或筛选条件试试。</p>
                  </div>
                ) : (
                  groupedDiaries.map(group => (
                    <section key={group.key} className={styles.diaryListGroup}>
                      <div className={styles.groupLabel}>{group.label}</div>
                      <ul className={styles.diaryList}>
                        {group.diaries.map(diary => {
                          const isSelected = diary.id === selectedDiaryId

                          return (
                            <li
                              key={diary.id}
                              className={isSelected ? `${styles.diaryListItem} ${styles.diaryListItemActive}` : styles.diaryListItem}
                              onClick={() => setSelectedDiaryId(diary.id)}
                            >
                              <div className={`${styles.diaryListDate} text-size-14 mb-4`}>{formatCreatedTime(diary.createdAt)}</div>
                              <div className={`${styles.diaryListTitle} mb-4`}>{diary.title}</div>
                              <div className={styles.diaryListSummary}>{buildDiarySummary(diary.content)}</div>
                              <div className={styles.diaryListActions}>
                                <Button
                                  type="default"
                                  icon={<EditOutlined />}
                                  aria-label={`编辑 ${diary.title}`}
                                  onClick={() => navigate(`/editor/${diary.id}`)}
                                />
                                <Button
                                  type="default"
                                  danger
                                  icon={<DeleteOutlined />}
                                  aria-label={`删除 ${diary.title}`}
                                  onClick={() => {
                                    handleDeleteDiary(diary)
                                  }}
                                />
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </aside>

            <section className={styles.diaryPreviewPanel} aria-label="日记内容预览">
              {selectedDiary ? (
                <article className={styles.diaryPreviewArticle}>
                  <div className={styles.diaryPreviewHeader}>
                    <p>{formatFullCreatedAt(selectedDiary.createdAt)}</p>
                    <h2>{selectedDiary.title}</h2>
                    <div className={styles.diaryPreviewMeta}>
                      <span>日记日期：{selectedDiary.diaryDate}</span>
                      <span>更新：{formatUpdatedAt(selectedDiary.updatedAt)}</span>
                      {selectedDiary.mood ? <span>心情：{selectedDiary.mood}</span> : null}
                      {selectedDiary.tags?.length ? <span>标签：{selectedDiary.tags.join(' / ')}</span> : null}
                    </div>
                  </div>
                  <div className={styles.diaryPreviewContent}>
                    {/*
                     * 右侧预览使用 Markdown 渲染，remark-gfm 负责表格、任务列表等 GFM 扩展。
                     */}
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedDiary.content || '没有正文预览'}</ReactMarkdown>
                  </div>
                </article>
              ) : (
                <div className={styles.diaryPreviewEmpty}>
                  <h2>选择一篇日记</h2>
                  <p>左侧选中后，这里会展示对应内容。</p>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/**
 * 构建日记摘要文本
 * 去除常见 Markdown 标记，生成列表页预览内容
 */
function buildDiarySummary(content: string): string {
  /*
   * 列表摘要去掉 Markdown 常见标记，让用户快速扫内容。
   * 这里只做轻量清洗，不承担完整 Markdown 解析职责。
   */
  const summary = content
    .replace(/[#>*_`[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return summary || '没有正文预览'
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
 * 获取今天日期字符串
 * 返回 YYYY-MM-DD 格式日期
 */
function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 构建 Web 预览日记
 * 补齐 Diary 类型需要的固定字段
 */
function createWebPreviewDiary(input: {
  id: string
  title: string
  content: string
  createdAt: number
  tags?: string[]
  mood?: string
}): Diary {
  return {
    id: input.id,
    title: input.title,
    content: input.content,
    filepath: '',
    diaryDate: formatCreatedDateKey(input.createdAt),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    tags: input.tags,
    mood: input.mood,
    deleted: false
  }
}

/**
 * 构建 Web 预览数据
 * 只在没有 Electron API 时使用，避免开发态页面空白或报错
 */
function buildWebPreviewDiaries(): Diary[] {
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  return [
    createWebPreviewDiary({
      id: `${WEB_PREVIEW_DIARY_ID_PREFIX}-today`,
      title: '整理书桌后的下午',
      content: `# 整理书桌后的下午

把桌面上散落的便签、旧笔和几张票根重新收好，空间一下子轻了很多。

今天最明显的感受是：当眼前的东西变少，脑子里的声音也会变小。晚上想继续把这份清爽留给明天。`,
      createdAt: now,
      tags: ['生活', '整理'],
      mood: '平静'
    }),
    createWebPreviewDiary({
      id: `${WEB_PREVIEW_DIARY_ID_PREFIX}-yesterday`,
      title: '雨后散步',
      content: `# 雨后散步

下班后雨停了，路面还亮着。沿着小区外的小路走了一圈，没有刻意听什么播客，只是让脚步自己往前。

回来时想起一句话：有些答案不是想出来的，是走出来的。`,
      createdAt: now - dayMs,
      tags: ['散步'],
      mood: '松弛'
    }),
    createWebPreviewDiary({
      id: `${WEB_PREVIEW_DIARY_ID_PREFIX}-last-week`,
      title: '周末读书记录',
      content: `# 周末读书记录

读完了两章，做了几条摘记。比起追求速度，今天更想把真正有触动的句子留下来。

- 先记录问题
- 再记录答案
- 最后记录自己的变化`,
      createdAt: now - 8 * dayMs,
      tags: ['阅读', '记录']
    })
  ]
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

/**
 * 格式化创建日期分组标题
 * 用中文日期展示分组信息
 */
function formatCreatedDateGroup(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}·${date.getMonth() + 1}月`
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date(timestamp))
}

/**
 * 格式化创建时间
 * 列表项只展示当天内的时间，节省左侧空间
 */
function formatCreatedTime(timestamp: number): string {
  const date = new Date(timestamp)

  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
  // return new Intl.DateTimeFormat('zh-CN', {
  //   month: 'numeric',
  //   day: 'numeric',
  //   weekday: 'short'
  // }).format(new Date(timestamp))
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
 * 将时间戳转换为列表展示的日期时间格式
 */
function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

export default DiaryListPage
