import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Diary } from '../../shared/diary'
import styles from '../App.module.scss'
import EchoButton from '../components/EchoButton'

const DEFAULT_NEW_DIARY_MARKDOWN = `# 今天的回声

写下今天值得被记住的片段。

- 发生了什么？
- 我当时有什么感受？
- 明天想带着什么继续出发？
`

function DiaryListPage() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<Diary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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
         * 日记数据依赖 Electron preload 暴露的 IPC API。
         * 如果只用浏览器打开 Vite 页面，保存和读取都不会真正落盘。
         */
        throw new Error('Electron diary API is unavailable.')
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
         * 新建日记会立即写数据库和 Markdown 文件，必须走 Electron preload API。
         */
        throw new Error('Electron diary API is unavailable.')
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
      <header className={styles.diaryListPageHeader}>
        <div>
          <p className={styles.diaryListPageEyebrow}>Echo Book</p>
          <h1>日记列表</h1>
        </div>
        <div className={styles.diaryListPageActions}>
          <EchoButton
            variant="outline"
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadDiaries()
            }}
          >
            刷新
          </EchoButton>
          <EchoButton icon={<PlusOutlined />} disabled={isCreating} onClick={handleCreateDiary}>
            {isCreating ? '新建中' : '新建日记'}
          </EchoButton>
        </div>
      </header>

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
          <ul className={styles.diaryList}>
            {diaries.map(diary => (
              <li key={diary.id} className={styles.diaryListItem}>
                <Button className={styles.diaryListMain} type="text" onClick={() => navigate(`/editor/${diary.id}`)}>
                  <span className={styles.diaryListDate}>{diary.diaryDate}</span>
                  <span className={styles.diaryListTitle}>{diary.title}</span>
                  <span className={styles.diaryListSummary}>{buildDiarySummary(diary.content)}</span>
                  <span className={styles.diaryListMeta}>
                    {formatUpdatedAt(diary.updatedAt)}
                    {diary.tags?.length ? ` · ${diary.tags.join(' / ')}` : ''}
                  </span>
                </Button>
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
            ))}
          </ul>
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
