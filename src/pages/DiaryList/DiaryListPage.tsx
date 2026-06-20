import { PlusOutlined } from '@ant-design/icons'
import { App as AntdApp, Empty } from 'antd'
import type { MenuProps } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import EchoButton from '../../components/EchoButton'
import { createDefaultDiary } from '../../utils/diaryCreation'
import { buildWebPreviewData } from '../../utils/webPreviewDiaries'
import EditorPage from '../EditorPage'
import DiaryListPanel from './DiaryListPanel'
import styles from './DiaryListPage.module.scss'
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

function DiaryListPage() {
  const navigate = useNavigate()
  const { modal } = AntdApp.useApp()
  const [diaries, setDiaries] = useState<Diary[]>([])
  const [selectedDiaryId, setSelectedDiaryId] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingDiary, setIsCreatingDiary] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
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
         * 这里给一组内存示例数据，让布局和搜索都能正常展示。
         */
        const previewData = buildWebPreviewData()
        setDiaries(previewData.diaries)
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
     * 没有结果时清空右侧编辑器，避免展示和左侧列表不一致的内容。
     */
    setSelectedDiaryId(currentDiaryId => {
      if (filteredDiaries.length === 0) {
        return ''
      }

      return filteredDiaries.some(diary => diary.id === currentDiaryId) ? currentDiaryId : filteredDiaries[0].id
    })
  }, [filteredDiaries])

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

  const handleDiarySaved = useCallback((updatedDiary: Diary) => {
    /*
     * 右侧编辑器保存成功后，直接替换左侧列表中的同一条日记元数据。
     */
    setDiaries(currentDiaries => currentDiaries.map(diary => (diary.id === updatedDiary.id ? updatedDiary : diary)))
  }, [])

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

            {selectedDiary ? (
              /*
               * 右侧直接渲染 EditorPage，选中左侧条目后即可编辑当前日记。
               */
              <EditorPage className={styles.diaryEditorPanel} diaryId={selectedDiary.id} embedded onDiarySaved={handleDiarySaved} />
            ) : (
              <div className={styles.diaryEditorEmpty}>
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
