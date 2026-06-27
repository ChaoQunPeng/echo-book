import { PlusOutlined } from '@ant-design/icons'
import { App as AntdApp, Empty } from 'antd'
import type { MenuProps } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import EchoButton from '../../components/EchoButton'
import { createDefaultDiary } from '../../utils/diaryCreation'
import { buildWebPreviewData } from '../../utils/webPreviewDiaries'
import EditorPage from '../EditorPage'
import DiaryListLoading from './DiaryListLoading'
import DiaryListPanel from './DiaryListPanel'
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

type LoadDiariesOptions = {
  showPageLoading?: boolean
}

type DiaryListCache = {
  diaries: Diary[]
  fullDiaries: Diary[]
  hasAnyDiary: boolean
  searchKeyword: string
  dateFilter: DateFilterValue
}

let diaryListCache: DiaryListCache | null = null

function DiaryListPage() {
  const navigate = useNavigate()
  const { diaryId: routeDiaryId } = useParams<{ diaryId: string }>()
  const { modal } = AntdApp.useApp()
  const cachedList = diaryListCache
  const cachedFullDiaries = cachedList?.fullDiaries ?? (cachedList?.searchKeyword.trim() ? [] : cachedList?.diaries ?? [])
  const cachedHasAnyDiary = cachedList?.hasAnyDiary ?? cachedFullDiaries.length > 0
  const hasLoadedDiariesRef = useRef(Boolean(cachedList))
  const fullDiariesRef = useRef<Diary[]>(cachedFullDiaries)
  const hasAnyDiaryRef = useRef(cachedHasAnyDiary)
  const [diaries, setDiaries] = useState<Diary[]>(() => cachedList?.diaries ?? [])
  const [hasAnyDiary, setHasAnyDiary] = useState(cachedHasAnyDiary)
  const [searchKeyword, setSearchKeyword] = useState(() => cachedList?.searchKeyword ?? '')
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(() => cachedList?.dateFilter ?? 'all')
  const [isLoading, setIsLoading] = useState(!cachedList)
  const [isCreatingDiary, setIsCreatingDiary] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const dateFilterRef = useRef(dateFilter)
  const currentDateFilterLabel = DATE_FILTER_OPTIONS.find(option => option.value === dateFilter)?.label ?? '全部日记'
  const hasActiveSearch = Boolean(searchKeyword.trim())

  const filteredDiaries = useMemo(() => {
    /*
     * diaryDate 暂时不在界面使用，列表展示统一按 createdAt 倒序处理。
     */
    return [...diaries]
      .filter(diary => isDiaryInDateFilter(diary, dateFilter))
      .sort((firstDiary, secondDiary) => {
        return secondDiary.createdAt - firstDiary.createdAt || secondDiary.updatedAt - firstDiary.updatedAt
      })
  }, [dateFilter, diaries])

  const selectedDiary = useMemo(() => {
    return filteredDiaries.find(diary => diary.id === routeDiaryId) ?? null
  }, [filteredDiaries, routeDiaryId])

  /**
   * 加载日记列表数据
   * 从本地数据库读取最近的日记记录并更新页面状态
   */
  const loadDiaries = useCallback(
    async (nextSearchKeyword = searchKeyword, options: LoadDiariesOptions = {}) => {
      /*
       * 没有缓存时展示整页读取态；已有缓存时只做后台刷新。
       */
      const shouldShowPageLoading = options.showPageLoading ?? true

      if (shouldShowPageLoading) {
        setIsLoading(true)
      }

      setErrorMessage('')

      try {
        const keyword = nextSearchKeyword.trim()
        let nextDiaries: Diary[]

        if (!window.diaryAPI) {
          /*
           * 纯 Web 调试环境没有 Electron preload API。
           * 这里给一组内存示例数据，让布局和搜索都能正常展示。
           */
          const previewData = buildWebPreviewData()
          nextDiaries = keyword ? searchWebPreviewDiaries(previewData.diaries, previewData.markdownById, keyword) : previewData.diaries
        } else {
          /*
           * 有关键词时走 SQLite FTS；无关键词时仍取最近列表，避免普通浏览被搜索接口耦合。
           */
          nextDiaries = keyword ? await window.diaryAPI.searchDiary(keyword) : await window.diaryAPI.getDiaryList({ limit: 100 })
        }

        /*
         * 空搜索结果只代表当前视图为空；无关键词列表才代表库里是否真的有日记。
         */
        const nextHasAnyDiary = keyword ? hasAnyDiaryRef.current || nextDiaries.length > 0 : nextDiaries.length > 0

        if (!keyword) {
          fullDiariesRef.current = nextDiaries
        }

        hasAnyDiaryRef.current = nextHasAnyDiary
        setDiaries(nextDiaries)
        setHasAnyDiary(nextHasAnyDiary)
        diaryListCache = {
          diaries: nextDiaries,
          fullDiaries: fullDiariesRef.current,
          hasAnyDiary: nextHasAnyDiary,
          searchKeyword: nextSearchKeyword,
          dateFilter: dateFilterRef.current
        }
      } catch (error) {
        console.error('Failed to load diary list:', error)
        setErrorMessage(`读取日记列表失败：${getErrorMessage(error)}`)
      } finally {
        hasLoadedDiariesRef.current = true

        if (shouldShowPageLoading) {
          setIsLoading(false)
        }
      }
    },
    [searchKeyword]
  )

  useEffect(() => {
    /*
     * 加载函数通过 ref 读取最新筛选值，避免筛选变化触发数据库请求。
     */
    dateFilterRef.current = dateFilter

    if (!hasLoadedDiariesRef.current) {
      return
    }

    /*
     * 筛选和搜索属于列表数据视图状态，切回列表时直接恢复。
     */
    diaryListCache = {
      diaries,
      fullDiaries: fullDiariesRef.current,
      hasAnyDiary,
      searchKeyword,
      dateFilter
    }
  }, [dateFilter, diaries, hasAnyDiary, searchKeyword])

  useEffect(() => {
    const searchTimer = window.setTimeout(() => {
      /*
       * 搜索框变化只刷新列表数据；缓存命中后切回页面不再展示整页 loading。
       */
      void loadDiaries(searchKeyword, { showPageLoading: !hasLoadedDiariesRef.current })
    }, 180)

    return () => window.clearTimeout(searchTimer)
  }, [loadDiaries, searchKeyword])

  useEffect(() => {
    /*
     * 选中项由 /list/:diaryId 控制；列表变化时只修正路由，不再维护本地选中状态。
     */
    if (isLoading) {
      return
    }

    if (filteredDiaries.length === 0) {
      if (routeDiaryId) {
        navigate('/list', { replace: true })
      }

      return
    }

    if (!routeDiaryId || !filteredDiaries.some(diary => diary.id === routeDiaryId)) {
      navigate(`/list/${filteredDiaries[0].id}`, { replace: true })
    }
  }, [filteredDiaries, isLoading, navigate, routeDiaryId])

  const handleSearchKeywordChange = useCallback((nextKeyword: string) => {
    /*
     * 清空搜索时先恢复最近一次全量列表，避免等待异步刷新期间误入“还没有日记”状态。
     */
    if (!nextKeyword.trim() && fullDiariesRef.current.length > 0) {
      setDiaries(fullDiariesRef.current)
      setHasAnyDiary(true)
      hasAnyDiaryRef.current = true
    }

    setSearchKeyword(nextKeyword)
  }, [])

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
             * Web 示例数据只存在于 React state。
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

  const handleDiarySaved = useCallback(
    (updatedDiary: Diary) => {
      /*
       * 右侧编辑器保存成功后，直接替换左侧列表中的同一条日记元数据。
       * 后台刷新只校准搜索结果和数据库排序，不再触发列表页读取 loading。
       */
      setDiaries(currentDiaries => currentDiaries.map(diary => (diary.id === updatedDiary.id ? updatedDiary : diary)))
      void loadDiaries(searchKeyword, { showPageLoading: false })
    },
    [loadDiaries, searchKeyword]
  )

  /*
   * 日记列表页是应用打开后的默认页面。
   * 列表页只负责查询、跳转和删除，具体正文编辑留给 EditorPage 处理。
   */
  return (
    <section className="flex h-full">
      {errorMessage ? <p className="text-size-13 leading-[1.5] text-[#b42318]">{errorMessage}</p> : null}

      <div className="min-h-0 flex-1">
        {isLoading ? <DiaryListLoading /> : null}

        {!isLoading && !hasAnyDiary && !hasActiveSearch ? (
          <div className="echo-empty-muted grid h-full min-h-360 place-items-center text-black-65">
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

        {!isLoading && (hasAnyDiary || hasActiveSearch) ? (
          <div className="flex h-full">
            <DiaryListPanel
              dateFilter={dateFilter}
              dateFilterMenuItems={DATE_FILTER_MENU_ITEMS}
              diaries={filteredDiaries}
              currentDateFilterLabel={currentDateFilterLabel}
              searchKeyword={searchKeyword}
              selectedDiaryId={routeDiaryId ?? ''}
              onDateFilterChange={setDateFilter}
              onDeleteDiary={handleDeleteDiary}
              onEditDiary={diary => navigate(`/editor/${diary.id}`)}
              onSearchKeywordChange={handleSearchKeywordChange}
            />

            {selectedDiary ? (
              /*
               * 右侧直接渲染 EditorPage，选中左侧条目后即可编辑当前日记。
               */
              <EditorPage className="h-full min-h-0 min-w-0 flex-1 overflow-auto" diaryId={selectedDiary.id} embedded onDiarySaved={handleDiarySaved} />
            ) : (
              <div className="grid flex-1 place-items-center text-[rgba(25,28,29,0.62)]">
                <Empty description="左侧选中后，这里会展示编辑器。" />
              </div>
            )}
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
 * Web 预览环境没有 SQLite FTS，用内存数据模拟标题 + 正文搜索。
 */
function searchWebPreviewDiaries(diaries: Diary[], markdownById: Record<string, string>, keyword: string): Diary[] {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  if (!normalizedKeyword) {
    return diaries
  }

  return diaries.filter(diary => {
    const markdown = markdownById[diary.id] ?? ''
    return `${diary.title}\n${markdown}`.toLocaleLowerCase().includes(normalizedKeyword)
  })
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

export default DiaryListPage
