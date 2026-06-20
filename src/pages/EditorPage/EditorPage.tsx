import { ArrowLeftOutlined, SaveOutlined, TagsOutlined } from '@ant-design/icons'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { Input, Select, Tag } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MOODS } from '../../../shared/moods'
import type { TagLibraryItem } from '../../../shared/tags'
import EchoButton from '../../components/EchoButton'
import styles from './EditorPage.module.scss'
import TagManagerDialog from './TagManagerDialog'

const EDITOR_DRAFT_STORAGE_KEY = 'echo-book:editor-draft'
const DEFAULT_TAG_COLOR = '#237804'
const AUTO_SAVE_INTERVAL_MS = 60 * 1000
const MOOD_SELECT_OPTIONS = MOODS.map(mood => ({
  value: mood.name,
  label: `${mood.emoji} ${mood.name}`
}))

type DiaryDraftFields = {
  title: string
  mood: string
  tagsInput: string
}

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
  const latestMarkdownRef = useRef(initialMarkdownRef.current)
  const latestFieldsRef = useRef<DiaryDraftFields>({
    title: '',
    mood: '',
    tagsInput: ''
  })
  const lastPersistedSnapshotRef = useRef('')
  const isAutoSavingRef = useRef(false)
  const isManualSavingRef = useRef(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [isEditorReady, setIsEditorReady] = useState(!isEditing)
  const [title, setTitle] = useState('')
  const [mood, setMood] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [tagLibrary, setTagLibrary] = useState<TagLibraryItem[]>([])
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState(isEditing ? '正在读取日记' : '草稿已就绪')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')

  async function loadTagLibrary() {
    if (!window.tagAPI) {
      setTagLibrary([])
      return
    }

    try {
      setTagLibrary(await window.tagAPI.getTagLibrary())
    } catch (error) {
      console.error('Failed to load tag library:', error)
      setTagLibrary([])
    }
  }

  useEffect(() => {
    /*
     * 标签库属于用户数据，启动编辑页时从 SQLite 读取。
     */
    void loadTagLibrary()
  }, [])

  const tagSelectOptions = useMemo(() => {
    return tagLibrary.map(tag => ({
      value: tag.name,
      label: (
        <span className={styles.tagSelectOption}>
          <span className={styles.tagSelectOptionDot} style={{ backgroundColor: tag.color }} />
          <span>{tag.name}</span>
        </span>
      )
    }))
  }, [tagLibrary])
  const tagColorMap = useMemo(() => {
    return new Map(tagLibrary.map(tag => [tag.name, tag.color]))
  }, [tagLibrary])

  useEffect(() => {
    let cancelled = false

    /*
     * 同一个 EditorPage 负责新建和编辑。
     * 路由 id 变化时重置表单和 Markdown 初始值，再用 editorVersion 触发 Crepe 重建。
     */
    if (!diaryId) {
      initialMarkdownRef.current = readEditorDraft()
      latestMarkdownRef.current = initialMarkdownRef.current
      lastPersistedSnapshotRef.current = ''
      setTitle('')
      setMood('')
      setTagsInput('')
      setLoadError('')
      setSaveStatus('草稿已就绪')
      setLastSavedAt(null)
      setIsEditorReady(true)
      setEditorVersion(version => version + 1)
      return () => {
        cancelled = true
      }
    }

    setIsEditorReady(false)
    setLoadError('')
    setSaveStatus('正在读取日记')

    window.diaryAPI
      .getDiaryById(diaryId)
      .then(diary => {
        if (cancelled) {
          return
        }

        if (!diary) {
          setLoadError('没有找到这篇日记')
          setSaveStatus('读取失败')
          return
        }

        const loadedMarkdown = diary.markdown || DEFAULT_EDITOR_MARKDOWN
        const loadedTagsInput = diary.tags?.join(', ') ?? ''

        initialMarkdownRef.current = loadedMarkdown
        latestMarkdownRef.current = loadedMarkdown
        latestFieldsRef.current = {
          title: diary.title,
          mood: diary.mood ?? '',
          tagsInput: loadedTagsInput
        }
        /*
         * 记录载入时的持久化快照，后续自动保存只在快照发生变化后才触发。
         */
        lastPersistedSnapshotRef.current = buildDiarySnapshot({
          ...latestFieldsRef.current,
          markdown: loadedMarkdown
        })
        setTitle(diary.title)
        setMood(diary.mood ?? '')
        setTagsInput(loadedTagsInput)
        setSaveStatus('日记已载入')
        setLastSavedAt(diary.updatedAt)
        setIsEditorReady(true)
        setEditorVersion(version => version + 1)
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
    /*
     * 自动保存的定时器保持稳定运行，最新表单值通过 ref 读取，
     * 避免用户连续输入时不断重建 interval 导致保存时机被推迟。
     */
    latestFieldsRef.current = {
      title,
      mood,
      tagsInput
    }
  }, [mood, tagsInput, title])

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
        [CrepeFeature.TopBar]: true
      },
      featureConfigs: {
        /*
         * placeholder 使用中文提示，让空文档状态和日记写作场景保持一致。
         * mode=block 可以在每个空段落中提示输入，适合长文编辑过程中的多段落写作。
         */
        [CrepeFeature.Placeholder]: {
          text: '继续写下这一刻...',
          mode: 'block'
        }
      }
    })

    crepeRef.current = crepe

    /*
     * markdownUpdated 会在文档内容变化后给出最新 Markdown。
     * 这里先做本地自动保存，保证用户刷新页面或切换路由后还能找回未提交的正文。
     */
    crepe.on(listener => {
      listener.markdownUpdated((_, markdown) => {
        latestMarkdownRef.current = markdown

        if (isEditing) {
          const currentSnapshot = buildDiarySnapshot({
            ...latestFieldsRef.current,
            markdown
          })

          if (currentSnapshot !== lastPersistedSnapshotRef.current) {
            setSaveStatus('有未保存更改')
          }
        } else {
          window.localStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, markdown)
          setSaveStatus('草稿已自动保存')
          setLastSavedAt(Date.now())
        }
      })
    })

    let disposed = false

    crepe
      .create()
      .then(() => {
        if (!disposed) {
          setSaveStatus(isEditing ? '日记已载入' : '草稿已就绪')
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

  useEffect(() => {
    if (!isEditing || !diaryId || !isEditorReady || loadError) {
      return
    }

    const autoSaveExistingDiary = async () => {
      if (isAutoSavingRef.current || isManualSavingRef.current) {
        return
      }

      const fields = latestFieldsRef.current
      const markdown = crepeRef.current?.getMarkdown() ?? latestMarkdownRef.current
      const snapshot = buildDiarySnapshot({
        ...fields,
        markdown
      })

      if (snapshot === lastPersistedSnapshotRef.current) {
        return
      }

      const normalizedTitle = fields.title.trim()

      if (!normalizedTitle || !markdown.trim()) {
        setSaveStatus('有未保存更改')
        return
      }

      isAutoSavingRef.current = true
      setSaveStatus('正在自动保存')

      try {
        if (!window.diaryAPI) {
          /*
           * 自动保存也必须走 Electron main process，保持和手动保存同一条持久化链路。
           */
          throw new Error('Electron diary API is unavailable.')
        }

        const updatedDiary = await window.diaryAPI.updateDiary({
          id: diaryId,
          title: normalizedTitle,
          markdown,
          mood: fields.mood.trim() ? fields.mood : null,
          tags: parseTags(fields.tagsInput)
        })

        lastPersistedSnapshotRef.current = snapshot

        const latestSnapshot = buildDiarySnapshot({
          ...latestFieldsRef.current,
          markdown: crepeRef.current?.getMarkdown() ?? latestMarkdownRef.current
        })
        setSaveStatus(latestSnapshot === snapshot ? '已自动保存' : '有未保存更改')
        setLastSavedAt(updatedDiary.updatedAt)
      } catch (error) {
        console.error('Failed to auto-save diary:', error)
        setSaveStatus(`自动保存失败：${getErrorMessage(error)}`)
      } finally {
        isAutoSavingRef.current = false
      }
    }

    /*
     * 一分钟做一次变更检查；没有变化时不会调用 IPC，也不会写数据库或 Markdown 文件。
     */
    const intervalId = window.setInterval(() => {
      void autoSaveExistingDiary()
    }, AUTO_SAVE_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [diaryId, isEditing, isEditorReady, loadError])

  const handleSaveDiary = async () => {
    /*
     * 提交前从 Crepe 读取最新 Markdown。
     * 自动保存只保护新建草稿，真正创建/更新仍然通过主进程 service 校验。
     */
    const markdown = crepeRef.current?.getMarkdown() ?? latestMarkdownRef.current
    const normalizedTitle = title.trim()

    console.info('Diary save button clicked:', {
      isEditing,
      hasDiaryAPI: Boolean(window.diaryAPI),
      titleLength: normalizedTitle.length,
      markdownLength: markdown.length
    })

    if (!normalizedTitle) {
      setSaveStatus('请填写标题')
      return
    }

    if (!markdown.trim()) {
      setSaveStatus('请填写正文')
      return
    }

    setIsSaving(true)
    isManualSavingRef.current = true
    setSaveStatus(isEditing ? '正在更新' : '正在创建')

    try {
      if (!window.diaryAPI) {
        /*
         * Markdown 文件写入发生在 Electron main process。
         * 纯浏览器环境没有 diaryAPI，必须明确提示用户使用桌面入口启动。
         */
        throw new Error('Electron diary API is unavailable.')
      }

      let savedDiaryId = diaryId
      let savedUpdatedAt = Date.now()

      if (diaryId) {
        const updatedDiary = await window.diaryAPI.updateDiary({
          id: diaryId,
          title: normalizedTitle,
          markdown,
          mood: mood.trim() ? mood : null,
          tags: parseTags(tagsInput)
        })
        savedUpdatedAt = updatedDiary.updatedAt
      } else {
        const createdDiary = await window.diaryAPI.createDiary({
          title: normalizedTitle,
          markdown,
          mood: mood.trim() || undefined,
          tags: parseTags(tagsInput)
        })
        savedDiaryId = createdDiary.id
        savedUpdatedAt = createdDiary.updatedAt
      }

      const savedSnapshot = buildDiarySnapshot({
        title: normalizedTitle,
        mood,
        tagsInput,
        markdown
      })

      window.localStorage.removeItem(EDITOR_DRAFT_STORAGE_KEY)
      lastPersistedSnapshotRef.current = savedSnapshot

      const latestSnapshot = buildDiarySnapshot({
        ...latestFieldsRef.current,
        markdown: crepeRef.current?.getMarkdown() ?? latestMarkdownRef.current
      })
      const isStillCurrent = latestSnapshot === savedSnapshot
      setSaveStatus('已保存')
      setLastSavedAt(savedUpdatedAt)

      if (!diaryId && savedDiaryId) {
        /*
         * 新建保存后仍停留在编辑页，只替换成带 id 的编辑地址。
         * 这样后续再次保存会走更新逻辑，不会重复创建日记。
         */
        navigate(`/editor/${savedDiaryId}`, { replace: true })
      } else if (!isStillCurrent) {
        setSaveStatus('有未保存更改')
      }
    } catch (error) {
      console.error('Failed to save diary:', error)
      setSaveStatus(`保存失败：${getErrorMessage(error)}`)
    } finally {
      setIsSaving(false)
      isManualSavingRef.current = false
    }
  }

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const isSaveKey = event.key.toLowerCase() === 's'
      const isApplePlatform = isAppleLikePlatform()
      /*
       * macOS / iPadOS 使用 Command+S，其余桌面平台使用 Ctrl+S。
       * Shift/Alt 组合通常代表“另存为”或系统级扩展快捷键，这里不抢占。
       */
      const isExpectedSaveShortcut = isApplePlatform ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey

      if (!isSaveKey || !isExpectedSaveShortcut || event.shiftKey || event.altKey) {
        return
      }

      event.preventDefault()

      if (isSaving || loadError) {
        return
      }

      void handleSaveDiary()
    }

    window.addEventListener('keydown', handleSaveShortcut)

    return () => {
      window.removeEventListener('keydown', handleSaveShortcut)
    }
  }, [handleSaveDiary, isSaving, loadError])

  const markExistingDiaryChanged = () => {
    /*
     * 标题、心情和标签也参与自动保存；新建日记仍保持正文草稿本地保存。
     * diaryDate 暂时不在界面编辑，由主进程按 createdAt 自动维护。
     */
    if (isEditing) {
      setSaveStatus('有未保存更改')
    }
  }

  /*
   * 编辑页负责承载日记正文的新增和修改体验。
   * 这里先保持为独立路由页面，后续如果需要区分“新建”和“编辑已有日记”，
   * 可以继续扩展为 `/editor`、`/editor/:diaryId` 这类更细的路由结构。
   */
  return (
    <section className={styles.editorPage}>
      <header className={styles.editorPageHeader}>
        {/* <div className={styles.editorPageTitleGroup}>
          <p className={styles.editorPageEyebrow}>Echo Book</p>
          <h1>{isEditing ? '编辑日记' : '新建日记'}</h1>
        </div> */}
        <div className={styles.editorPageActions}>
          <span className={styles.editorPageStatus} aria-live="polite">
            {saveStatus}
            {lastSavedAt ? ` · 更新：${formatLastSavedAt(lastSavedAt)}` : ''}
          </span>
          <EchoButton variant="outline" icon={<ArrowLeftOutlined />} onClick={() => navigate('/list')}>
            返回列表
          </EchoButton>
          <EchoButton icon={<SaveOutlined />} disabled={isSaving || Boolean(loadError)} onClick={handleSaveDiary}>
            {isEditing ? '保存修改' : '创建日记'}
          </EchoButton>
        </div>
      </header>

      <div className={styles.editorPageForm}>
        <label className={styles.editorField}>
          <span>标题</span>
          <Input
            value={title}
            placeholder="给这一天起个名字"
            onChange={event => {
              setTitle(event.target.value)
              markExistingDiaryChanged()
            }}
          />
        </label>

        <label className={styles.editorField}>
          <span>心情</span>
          {/* icon={<SearchOutlined />} */}

          <Select
            allowClear
            value={mood || undefined}
            placeholder="选择今天的心情"
            options={MOOD_SELECT_OPTIONS}
            onChange={value => {
              /*
               * 下拉值只保存心情名称，emoji 由展示层统一补充。
               */
              setMood(value ?? '')
              markExistingDiaryChanged()
            }}
          />
        </label>
        <div className={styles.editorField}>
          <span>标签</span>
          <div className={styles.tagSelectRow}>
            <Select
              mode="tags"
              allowClear
              className={styles.tagSelect}
              value={parseTags(tagsInput)}
              placeholder="选择或输入标签"
              options={tagSelectOptions}
              optionFilterProp="value"
              tagRender={tag => {
                /*
                 * 已选标签展示标签库颜色；新输入但未保存入库的标签使用默认颜色兜底。
                 */
                const tagName = String(tag.value)
                const tagColor = tagColorMap.get(tagName) ?? DEFAULT_TAG_COLOR

                return (
                  <Tag className={styles.tagSelectTag} closable={tag.closable} onClose={tag.onClose}>
                    <span className={styles.tagSelectTagDot} style={{ backgroundColor: tagColor }} />
                    <span className={styles.tagSelectTagText}>{tag.label}</span>
                  </Tag>
                )
              }}
              onChange={(nextTags: string[]) => {
                /*
                 * Select 支持输入新标签；保存日记时主进程会自动写入标签库。
                 */
                setTagsInput(normalizeTagList(nextTags).join(', '))
                markExistingDiaryChanged()
              }}
            />
            <EchoButton variant="outline" icon={<TagsOutlined />} onClick={() => setIsTagManagerOpen(true)}>
              管理
            </EchoButton>
          </div>
        </div>
      </div>

      <TagManagerDialog open={isTagManagerOpen} onOpenChange={setIsTagManagerOpen} onTagsChanged={loadTagLibrary} />

      {loadError ? <p className={styles.editorPageError}>{loadError}</p> : null}

      <div className={styles.editorPageWorkspace}>
        {isEditorReady ? <div ref={editorRootRef} className={styles.editorPageMilkdown} /> : null}
      </div>

      <div className={styles.editorPageFooterActions}>
        <EchoButton variant="outline" icon={<ArrowLeftOutlined />} onClick={() => navigate('/list')}>
          返回列表
        </EchoButton>
        <EchoButton icon={<SaveOutlined />} disabled={isSaving || Boolean(loadError)} onClick={handleSaveDiary}>
          {isEditing ? '保存修改' : '创建日记'}
        </EchoButton>
      </div>
    </section>
  )
}

function parseTags(value: string): string[] {
  /*
   * 标签输入支持英文逗号和中文逗号，方便中文输入法场景直接录入。
   */
  return normalizeTagList(value.split(/[,，]/))
}

function normalizeTagList(tags: string[]): string[] {
  /*
   * Select tags 模式可能产生重复文本，这里统一 trim 和去重。
   */
  return Array.from(new Set(tags.map(tag => tag.trim()).filter(Boolean)))
}

function buildDiarySnapshot(input: DiaryDraftFields & { markdown: string }): string {
  /*
   * 快照只用于前端判断“是否真的变了”，保持字段规整后再比较，
   * 可以避免标签空格、标题首尾空格这类无效输入反复触发自动保存。
   */
  return JSON.stringify({
    title: input.title.trim(),
    mood: input.mood.trim(),
    tags: parseTags(input.tagsInput),
    markdown: input.markdown
  })
}

function isAppleLikePlatform(): boolean {
  /*
   * Electron renderer 没有直接使用 Node.js process，这里通过浏览器平台信息区分快捷键习惯。
   */
  return /Mac|iPhone|iPad|iPod/.test(window.navigator.platform)
}

function formatLastSavedAt(timestamp: number): string {
  /*
   * 顶部状态只需要简短时间，帮助用户确认最近一次成功保存发生在什么时候。
   */
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function getErrorMessage(error: unknown): string {
  /*
   * 把 IPC / 校验 / 运行环境错误压成短文本显示在保存状态中。
   * 这样保存失败时可以直接看到是 Electron API 缺失、字段校验失败，还是主进程异常。
   */
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '请确认通过 Electron 启动应用'
}

export default EditorPage
