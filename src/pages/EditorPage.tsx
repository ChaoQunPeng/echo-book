import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import EchoButton from '../components/EchoButton'

const EDITOR_DRAFT_STORAGE_KEY = 'echo-book:editor-draft'

const DEFAULT_EDITOR_MARKDOWN = `# 今天的回声

写下今天值得被记住的片段。

- 发生了什么？
- 我当时有什么感受？
- 明天想带着什么继续出发？
`

function readEditorDraft() {
  /*
   * 编辑器页面目前只在浏览器/Tauri WebView 中运行，但这里仍然判断 window，
   * 可以避免后续引入服务端渲染、预渲染或单元测试时因为 localStorage 不存在而崩溃。
   */
  if (typeof window === 'undefined') {
    return DEFAULT_EDITOR_MARKDOWN
  }

  /*
   * 本地草稿只存正文 Markdown。
   * Milkdown/Crepe 会把 Markdown 渲染成富文本编辑界面，因此持久化层保持轻量，
   * 后续接入数据库或 Tauri 文件系统时，也可以直接复用这份 Markdown 字符串。
   */
  return window.localStorage.getItem(EDITOR_DRAFT_STORAGE_KEY) ?? DEFAULT_EDITOR_MARKDOWN
}

function EditorPage() {
  const navigate = useNavigate()
  const { diaryId } = useParams<{ diaryId: string }>()
  const isEditing = Boolean(diaryId)
  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const initialMarkdownRef = useRef(readEditorDraft())
  const [editorVersion, setEditorVersion] = useState(0)
  const [isEditorReady, setIsEditorReady] = useState(!isEditing)
  const [title, setTitle] = useState('')
  const [diaryDate, setDiaryDate] = useState(getTodayDateString())
  const [mood, setMood] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [saveStatus, setSaveStatus] = useState(isEditing ? '正在读取日记' : '草稿已就绪')
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false

    /*
     * 同一个 EditorPage 负责新建和编辑。
     * 路由 id 变化时重置表单和 Markdown 初始值，再用 editorVersion 触发 Crepe 重建。
     */
    if (!diaryId) {
      initialMarkdownRef.current = readEditorDraft()
      setTitle('')
      setDiaryDate(getTodayDateString())
      setMood('')
      setTagsInput('')
      setLoadError('')
      setSaveStatus('草稿已就绪')
      setIsEditorReady(true)
      setEditorVersion((version) => version + 1)
      return () => {
        cancelled = true
      }
    }

    setIsEditorReady(false)
    setLoadError('')
    setSaveStatus('正在读取日记')

    window.diaryAPI
      .getDiaryById(diaryId)
      .then((diary) => {
        if (cancelled) {
          return
        }

        if (!diary) {
          setLoadError('没有找到这篇日记')
          setSaveStatus('读取失败')
          return
        }

        initialMarkdownRef.current = diary.content || DEFAULT_EDITOR_MARKDOWN
        setTitle(diary.title)
        setDiaryDate(diary.diaryDate)
        setMood(diary.mood ?? '')
        setTagsInput(diary.tags?.join(', ') ?? '')
        setSaveStatus('日记已载入')
        setIsEditorReady(true)
        setEditorVersion((version) => version + 1)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('读取日记失败')
          setSaveStatus('读取失败')
        }
      })

    return () => {
      cancelled = true
    }
  }, [diaryId])

  useEffect(() => {
    if (!isEditorReady) {
      return
    }

    const editorRoot = editorRootRef.current

    if (!editorRoot) {
      return
    }

    /*
     * React 18/19 的 StrictMode 在开发环境会主动重复挂载副作用，用来发现清理逻辑问题。
     * 在创建 Milkdown 实例前先清空容器，可以避免热更新或重复挂载后残留旧的 ProseMirror DOM。
     */
    editorRoot.innerHTML = ''

    const crepe = new Crepe({
      root: editorRoot,
      defaultValue: initialMarkdownRef.current,
      features: {
        /*
         * TopBar 默认关闭；这里打开它，让编辑页拥有固定格式工具栏。
         * 其余常用能力（选区工具栏、列表、链接、表格、代码块、数学公式等）沿用 Crepe 默认配置。
         */
        [CrepeFeature.TopBar]: true,
      },
      featureConfigs: {
        /*
         * placeholder 使用中文提示，让空文档状态和日记写作场景保持一致。
         * mode=block 可以在每个空段落中提示输入，适合长文编辑过程中的多段落写作。
         */
        [CrepeFeature.Placeholder]: {
          text: '继续写下这一刻...',
          mode: 'block',
        },
      },
    })

    crepeRef.current = crepe

    /*
     * markdownUpdated 会在文档内容变化后给出最新 Markdown。
     * 这里先做本地自动保存，保证用户刷新页面或切换路由后还能找回未提交的正文。
     */
    crepe.on((listener) => {
      listener.markdownUpdated((_, markdown) => {
        if (isEditing) {
          setSaveStatus('有未保存更改')
        } else {
          window.localStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, markdown)
          setSaveStatus('草稿已自动保存')
        }
      })
    })

    let disposed = false

    crepe
      .create()
      .then(() => {
        if (!disposed) {
          setSaveStatus('草稿已就绪')
        }
      })
      .catch(() => {
        if (!disposed) {
          setSaveStatus('编辑器加载失败')
        }
      })

    return () => {
      disposed = true
      crepeRef.current = null

      /*
       * Crepe 的销毁过程是异步的。
       * cleanup 中不等待它完成，让 React 可以继续卸载；destroy 自己会清理 Milkdown 插件和 DOM 监听。
       */
      void crepe.destroy()
    }
  }, [editorVersion, isEditorReady, isEditing])

  const handleSaveDiary = async () => {
    /*
     * 提交前从 Crepe 读取最新 Markdown。
     * 自动保存只保护新建草稿，真正创建/更新仍然通过主进程 service 校验。
     */
    const markdown = crepeRef.current?.getMarkdown() ?? initialMarkdownRef.current
    const normalizedTitle = title.trim()

    if (!normalizedTitle) {
      setSaveStatus('请填写标题')
      return
    }

    if (!markdown.trim()) {
      setSaveStatus('请填写正文')
      return
    }

    setIsSaving(true)
    setSaveStatus(isEditing ? '正在更新' : '正在创建')

    try {
      const savedDiary = diaryId
        ? await window.diaryAPI.updateDiary({
            id: diaryId,
            title: normalizedTitle,
            content: markdown,
            diaryDate,
            mood: mood.trim() ? mood : null,
            tags: parseTags(tagsInput),
          })
        : await window.diaryAPI.createDiary({
            title: normalizedTitle,
            content: markdown,
            diaryDate,
            mood: mood.trim() || undefined,
            tags: parseTags(tagsInput),
          })

      window.localStorage.removeItem(EDITOR_DRAFT_STORAGE_KEY)
      setSaveStatus('已保存')

      if (!diaryId) {
        navigate(`/editor/${savedDiary.id}`, { replace: true })
      }
    } catch {
      setSaveStatus('保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  /*
   * 编辑页负责承载日记正文的新增和修改体验。
   * 这里先保持为独立路由页面，后续如果需要区分“新建”和“编辑已有日记”，
   * 可以继续扩展为 `/editor`、`/editor/:diaryId` 这类更细的路由结构。
   */
  return (
    <section className="editor-page">
      <header className="editor-page__header">
        <div className="editor-page__title-group">
          <p className="editor-page__eyebrow">Echo Book</p>
          <h1>{isEditing ? '编辑日记' : '新建日记'}</h1>
        </div>
        <div className="editor-page__actions">
          <span className="editor-page__status" aria-live="polite">
            {saveStatus}
          </span>
          <EchoButton variant="outline" icon={<ArrowLeftOutlined />} onClick={() => navigate('/list')}>
            返回列表
          </EchoButton>
          <EchoButton icon={<SaveOutlined />} disabled={isSaving || Boolean(loadError)} onClick={handleSaveDiary}>
            {isEditing ? '保存修改' : '创建日记'}
          </EchoButton>
        </div>
      </header>

      <div className="editor-page__form">
        <label className="editor-field editor-field--title">
          <span>标题</span>
          <input value={title} placeholder="给这一天起个名字" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="editor-field">
          <span>日期</span>
          <input type="date" value={diaryDate} onChange={(event) => setDiaryDate(event.target.value)} />
        </label>
        <label className="editor-field">
          <span>心情</span>
          <input value={mood} placeholder="平静、期待..." onChange={(event) => setMood(event.target.value)} />
        </label>
        <label className="editor-field">
          <span>标签</span>
          <input value={tagsInput} placeholder="工作, 生活" onChange={(event) => setTagsInput(event.target.value)} />
        </label>
      </div>

      {loadError ? <p className="editor-page__error">{loadError}</p> : null}

      <div className="editor-page__workspace">
        {isEditorReady ? <div ref={editorRootRef} className="editor-page__milkdown" /> : null}
      </div>
    </section>
  )
}

function parseTags(value: string): string[] {
  /*
   * 标签输入支持英文逗号和中文逗号，方便中文输入法场景直接录入。
   */
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export default EditorPage
