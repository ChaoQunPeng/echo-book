import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import DiaryPreview from '../../components/DiaryPreview'
import { buildWebPreviewData } from '../../utils/webPreviewDiaries'

function DiaryPreviewPage() {
  const navigate = useNavigate()
  const { diaryId } = useParams()
  const [diary, setDiary] = useState<Diary | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadDiary = async () => {
      setIsLoading(true)
      setErrorMessage('')
      setDiary(null)
      setMarkdown('')

      if (!diaryId) {
        setErrorMessage('缺少日记 id')
        setIsLoading(false)
        return
      }

      try {
        if (!window.diaryAPI) {
          /*
           * Web 调试环境没有 Electron preload API，直接从示例数据里读取预览内容。
           */
          const previewData = buildWebPreviewData()
          const matchedDiary = previewData.diaries.find(currentDiary => currentDiary.id === diaryId) ?? null

          if (!cancelled) {
            setDiary(matchedDiary)
            setMarkdown(matchedDiary ? previewData.markdownById[matchedDiary.id] ?? '' : '')
            setErrorMessage(matchedDiary ? '' : '没有找到这篇日记')
          }

          return
        }

        /*
         * 预览页只读取详情，不修改日记内容。
         */
        const diaryDetail = await window.diaryAPI.getDiaryById(diaryId)

        if (cancelled) {
          return
        }

        if (!diaryDetail) {
          setErrorMessage('没有找到这篇日记')
          return
        }

        setDiary(diaryDetail)
        setMarkdown(diaryDetail.markdown)
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load diary preview:', error)
          setErrorMessage(`读取日记预览失败：${getErrorMessage(error)}`)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadDiary()

    return () => {
      cancelled = true
    }
  }, [diaryId])

  return (
    <section className="flex h-full flex-col bg-page">
      <header className="flex flex-[0_0_auto] items-center justify-between gap-12 border-b border-[rgba(15,82,56,0.08)] bg-white px-24 py-16">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
        <Button type="primary" icon={<EditOutlined />} disabled={!diaryId || !diary} onClick={() => navigate(`/editor/${diaryId}`)}>
          编辑
        </Button>
      </header>

      <DiaryPreview
        className="flex-1"
        diary={diary}
        markdown={markdown}
        loading={isLoading}
        errorMessage={errorMessage}
        emptyTitle="没有可预览的日记"
        emptyDescription="请从列表或时光页选择一篇日记。"
      />
    </section>
  )
}

/**
 * 获取错误信息文本
 * 将未知错误对象转换成页面上可展示的提示。
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '请稍后重试'
}

export default DiaryPreviewPage
