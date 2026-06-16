import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Diary } from '../../shared/diary'
import EchoButton from '../components/EchoButton'

function DiaryListPage() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<Diary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const loadDiaries = async () => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      /*
       * 列表页先取最近 100 条，满足当前轻量日记场景。
       * 后续做无限滚动或搜索时，可以在这里继续使用 limit/offset 扩展。
       */
      const diaryList = await window.diaryAPI.getDiaryList({ limit: 100 })
      setDiaries(diaryList)
    } catch {
      setErrorMessage('读取日记列表失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDiaries()
  }, [])

  const handleDeleteDiary = async (diary: Diary) => {
    /*
     * 删除当前走软删除，仍然在 UI 层给二次确认，避免误点导致列表项立刻消失。
     */
    const shouldDelete = window.confirm(`确认删除「${diary.title}」吗？`)

    if (!shouldDelete) {
      return
    }

    try {
      await window.diaryAPI.deleteDiary(diary.id)
      await loadDiaries()
    } catch {
      setErrorMessage('删除日记失败')
    }
  }

  /*
   * 日记列表页是应用打开后的默认页面。
   * 列表页只负责查询、跳转和删除，具体正文编辑留给 EditorPage 处理。
   */
  return (
    <section className="diary-list-page">
      <header className="diary-list-page__header">
        <div>
          <p className="diary-list-page__eyebrow">Echo Book</p>
          <h1>日记列表</h1>
        </div>
        <div className="diary-list-page__actions">
          <EchoButton
            variant="outline"
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadDiaries()
            }}
          >
            刷新
          </EchoButton>
          <EchoButton icon={<PlusOutlined />} onClick={() => navigate('/editor')}>
            新建日记
          </EchoButton>
        </div>
      </header>

      {errorMessage ? <p className="diary-list-page__error">{errorMessage}</p> : null}

      <div className="diary-list-page__content">
        {isLoading ? <p className="diary-list-page__empty">正在读取日记...</p> : null}

        {!isLoading && diaries.length === 0 ? (
          <div className="diary-list-page__empty-state">
            <h2>还没有日记</h2>
            <p>从一篇新的记录开始。</p>
            <EchoButton icon={<PlusOutlined />} onClick={() => navigate('/editor')}>
              写第一篇
            </EchoButton>
          </div>
        ) : null}

        {!isLoading && diaries.length > 0 ? (
          <ul className="diary-list">
            {diaries.map((diary) => (
              <li key={diary.id} className="diary-list__item">
                <button
                  className="diary-list__main"
                  type="button"
                  onClick={() => navigate(`/editor/${diary.id}`)}
                >
                  <span className="diary-list__date">{diary.diaryDate}</span>
                  <span className="diary-list__title">{diary.title}</span>
                  <span className="diary-list__summary">{buildDiarySummary(diary.content)}</span>
                  <span className="diary-list__meta">
                    {formatUpdatedAt(diary.updatedAt)}
                    {diary.tags?.length ? ` · ${diary.tags.join(' / ')}` : ''}
                  </span>
                </button>
                <div className="diary-list__actions">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`编辑 ${diary.title}`}
                    onClick={() => navigate(`/editor/${diary.id}`)}
                  >
                    <EditOutlined />
                  </button>
                  <button
                    className="icon-button icon-button--danger"
                    type="button"
                    aria-label={`删除 ${diary.title}`}
                    onClick={() => {
                      void handleDeleteDiary(diary)
                    }}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

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

function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export default DiaryListPage
