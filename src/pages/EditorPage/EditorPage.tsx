import { ArrowLeftOutlined, EditOutlined, SaveOutlined, SettingOutlined, SmileOutlined, TagsOutlined } from '@ant-design/icons'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { Button, Checkbox, Input, Popover, Space, Tag } from 'antd'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import { formatMood, MOODS } from '../../../shared/moods'
import type { TagLibraryItem } from '../../../shared/tags'
import styles from './EditorPage.module.scss'
import TagManagerDialog from './TagManagerDialog'

const DEFAULT_TAG_COLOR = '#237804'
const AUTO_SAVE_INTERVAL_MS = 60 * 1000

type DiaryDraftFields = {
  title: string
  mood: string
  tagsInput: string
}

type SelectableTag = Pick<TagLibraryItem, 'name' | 'color'>

type EditorPageProps = {
  diaryId?: string
  embedded?: boolean
  className?: string
  onDiarySaved?: (diary: Diary) => void
}

function EditorPage({ diaryId: providedDiaryId, embedded = false, className = '', onDiarySaved }: EditorPageProps) {
  const navigate = useNavigate()
  const { diaryId: routeDiaryId } = useParams<{ diaryId: string }>()
  /*
   * 路由页面从 URL 读取 id；列表页内嵌时由父组件直接传入 id。
   */
  const diaryId = providedDiaryId ?? routeDiaryId
  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const initialMarkdownRef = useRef('')
  const latestMarkdownRef = useRef(initialMarkdownRef.current)
  const assetPreviewUrlCacheRef = useRef(new Map<string, string>())
  const latestFieldsRef = useRef<DiaryDraftFields>({
    title: '',
    mood: '',
    tagsInput: ''
  })
  const lastPersistedSnapshotRef = useRef('')
  const isAutoSavingRef = useRef(false)
  const isManualSavingRef = useRef(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [isEditorReady, setIsEditorReady] = useState(false)
  const [title, setTitle] = useState('')
  const [mood, setMood] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [tagLibrary, setTagLibrary] = useState<TagLibraryItem[]>([])
  const [isMoodPopoverOpen, setIsMoodPopoverOpen] = useState(false)
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState('正在读取日记')
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

  const tagColorMap = useMemo(() => {
    return new Map(tagLibrary.map(tag => [tag.name, tag.color]))
  }, [tagLibrary])
  const selectedTags = useMemo(() => parseTags(tagsInput), [tagsInput])
  const selectableTags = useMemo(() => {
    /*
     * 历史日记里可能存在已删除或手动创建过的标签，选择器里也保留它们。
     */
    const tagMap = new Map<string, SelectableTag>(tagLibrary.map(tag => [tag.name, tag]))

    selectedTags.forEach(tagName => {
      if (!tagMap.has(tagName)) {
        tagMap.set(tagName, {
          name: tagName,
          color: DEFAULT_TAG_COLOR
        })
      }
    })

    return Array.from(tagMap.values())
  }, [selectedTags, tagLibrary])
  const selectedMood = mood ? formatMood(mood) : null

  useEffect(() => {
    let cancelled = false

    /*
     * EditorPage 只编辑已经创建好的日记。
     * 路由 id 变化时重置表单和 Markdown 初始值，再用 editorVersion 触发 Crepe 重建。
     */
    if (!diaryId) {
      /*
       * 正常路由只有 /editor/:diaryId。
       * 这里保留防御分支，避免测试或异常挂载时继续请求无效 id。
       */
      initialMarkdownRef.current = ''
      latestMarkdownRef.current = ''
      assetPreviewUrlCacheRef.current.clear()
      lastPersistedSnapshotRef.current = ''
      setTitle('')
      setMood('')
      setTagsInput('')
      setLoadError('缺少日记 id')
      setSaveStatus('无法读取日记')
      setLastSavedAt(null)
      setIsEditorReady(false)
      return () => {
        cancelled = true
      }
    }

    setIsEditorReady(false)
    setLoadError('')
    setSaveStatus('正在读取日记')

    if (!window.diaryAPI) {
      /*
       * 真实日记正文需要通过 Electron preload API 读取。
       * Web 预览环境没有这条 IPC 链路，因此直接给出启动提示。
       */
      setLoadError('请通过 Electron 启动应用后编辑日记')
      setSaveStatus('读取失败')
      return () => {
        cancelled = true
      }
    }

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

        const loadedMarkdown = diary.markdown || ''
        const loadedTagsInput = diary.tags?.join(', ') ?? ''

        initialMarkdownRef.current = loadedMarkdown
        latestMarkdownRef.current = loadedMarkdown
        assetPreviewUrlCacheRef.current.clear()
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

    const uploadDiaryImage = async (file: File) => {
      /*
       * Crepe 会把粘贴、拖拽和工具栏上传都汇总到这里。
       * renderer 只读取 File 数据，真正写入路径由 main process 控制。
       */
      if (!diaryId || !window.diaryAPI) {
        throw new Error('无法保存图片，请通过 Electron 打开日记')
      }

      const asset = await window.diaryAPI.saveDiaryAsset({
        diaryId,
        fileName: file.name,
        mimeType: file.type || inferImageMimeType(file.name),
        data: await file.arrayBuffer()
      })

      setSaveStatus('图片已保存到 assets，正文有未保存更改')

      return asset.relativePath
    }

    const resolveDiaryImageUrl = async (url: string) => {
      /*
       * Markdown 里保存相对路径，编辑器 DOM 里临时转换成 data URL 才能预览本地图片。
       */
      if (!diaryId || !window.diaryAPI || !isDiaryAssetPath(url)) {
        return url
      }

      const cacheKey = `${diaryId}:${url}`
      const cachedUrl = assetPreviewUrlCacheRef.current.get(cacheKey)
      if (cachedUrl) {
        return cachedUrl
      }

      const dataUrl = await window.diaryAPI.getDiaryAssetDataUrl({
        diaryId,
        relativePath: url
      })
      assetPreviewUrlCacheRef.current.set(cacheKey, dataUrl)

      return dataUrl
    }

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
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: uploadDiaryImage,
          proxyDomURL: resolveDiaryImageUrl,
          inlineUploadButton: '上传',
          blockUploadButton: '上传图片',
          inlineUploadPlaceholderText: '或粘贴图片链接',
          blockUploadPlaceholderText: '或粘贴图片链接'
        }
      }
    })

    crepeRef.current = crepe

    /*
     * markdownUpdated 会在文档内容变化后给出最新 Markdown。
     * 创建动作已经提前落库，因此这里只负责标记已有日记是否有未保存更改。
     */
    crepe.on(listener => {
      listener.markdownUpdated((_, markdown) => {
        latestMarkdownRef.current = markdown

        const currentSnapshot = buildDiarySnapshot({
          ...latestFieldsRef.current,
          markdown
        })

        if (currentSnapshot !== lastPersistedSnapshotRef.current) {
          setSaveStatus('有未保存更改')
        }
      })
    })

    let disposed = false

    crepe
      .create()
      .then(() => {
        if (!disposed) {
          setSaveStatus('日记已载入')
        }
      })
      .catch(() => {
        if (!disposed) {
          setSaveStatus('编辑器加载失败')
        }
      })

    return () => {
      disposed = true
      /*
       * 离开页面时先同步缓存一次当前正文，避免 Crepe 销毁后取不到最新内容。
       */
      latestMarkdownRef.current = crepe.getMarkdown()
      crepeRef.current = null

      /*
       * Crepe 的销毁过程是异步的。
       * cleanup 中不等待它完成，让 React 可以继续卸载；destroy 自己会清理 Milkdown 插件和 DOM 监听。
       */
      void crepe.destroy()
    }
  }, [diaryId, editorVersion, isEditorReady])

  useEffect(() => {
    if (!diaryId || !isEditorReady || loadError) {
      return
    }

    const saveExistingDiaryDraft = async (reason: 'auto' | 'leave') => {
      const shouldUpdateStatus = reason === 'auto'

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
        if (shouldUpdateStatus) {
          setSaveStatus('有未保存更改')
        }
        return
      }

      isAutoSavingRef.current = true

      if (shouldUpdateStatus) {
        setSaveStatus('正在自动保存')
      }

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
        /*
         * 通知父级刷新列表元数据，标题、心情、标签和更新时间会立即同步到左侧列表。
         */
        onDiarySaved?.(updatedDiary)

        const latestSnapshot = buildDiarySnapshot({
          ...latestFieldsRef.current,
          markdown: crepeRef.current?.getMarkdown() ?? latestMarkdownRef.current
        })

        if (shouldUpdateStatus) {
          setSaveStatus(latestSnapshot === snapshot ? '已自动保存' : '有未保存更改')
          setLastSavedAt(updatedDiary.updatedAt)
        }
      } catch (error) {
        console.error('Failed to auto-save diary:', error)

        if (shouldUpdateStatus) {
          setSaveStatus(`自动保存失败：${getErrorMessage(error)}`)
        }
      } finally {
        isAutoSavingRef.current = false
      }
    }

    /*
     * 一分钟做一次变更检查；没有变化时不会调用 IPC，也不会写数据库或 Markdown 文件。
     */
    const intervalId = window.setInterval(() => {
      void saveExistingDiaryDraft('auto')
    }, AUTO_SAVE_INTERVAL_MS)

    return () => {
      /*
       * 路由切走或组件卸载时静默保存一次，保证返回列表、切换页面等离开动作不会丢掉最后修改。
       */
      void saveExistingDiaryDraft('leave')
      window.clearInterval(intervalId)
    }
  }, [diaryId, isEditorReady, loadError])

  const handleSaveDiary = async () => {
    /*
     * 提交前从 Crepe 读取最新 Markdown。
     * 创建动作已经在入口完成，这里只负责更新当前日记。
     */
    const markdown = crepeRef.current?.getMarkdown() ?? latestMarkdownRef.current
    const normalizedTitle = title.trim()

    console.info('Diary save button clicked:', {
      diaryId,
      hasDiaryAPI: Boolean(window.diaryAPI),
      titleLength: normalizedTitle.length,
      markdownLength: markdown.length
    })

    if (!diaryId) {
      setSaveStatus('缺少日记 id')
      return
    }

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
    setSaveStatus('正在保存')

    try {
      if (!window.diaryAPI) {
        /*
         * Markdown 文件写入发生在 Electron main process。
         * 纯浏览器环境没有 diaryAPI，必须明确提示用户使用桌面入口启动。
         */
        throw new Error('Electron diary API is unavailable.')
      }

      const updatedDiary = await window.diaryAPI.updateDiary({
        id: diaryId,
        title: normalizedTitle,
        markdown,
        mood: mood.trim() ? mood : null,
        tags: parseTags(tagsInput)
      })

      const savedSnapshot = buildDiarySnapshot({
        title: normalizedTitle,
        mood,
        tagsInput,
        markdown
      })

      lastPersistedSnapshotRef.current = savedSnapshot
      /*
       * 手动保存成功后同步外层列表，避免左侧仍显示旧标题。
       */
      onDiarySaved?.(updatedDiary)

      const latestSnapshot = buildDiarySnapshot({
        ...latestFieldsRef.current,
        markdown: crepeRef.current?.getMarkdown() ?? latestMarkdownRef.current
      })
      const isStillCurrent = latestSnapshot === savedSnapshot
      setSaveStatus('已保存')
      setLastSavedAt(updatedDiary.updatedAt)

      if (!isStillCurrent) {
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
     * 标题、心情和标签也参与自动保存。
     * diaryDate 暂时不在界面编辑，由主进程按 createdAt 自动维护。
     */
    setSaveStatus('有未保存更改')
  }

  const handlePickerTriggerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    /*
     * 自定义触发区域不是原生按钮，补齐 Enter 和 Space 的键盘操作。
     */
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.currentTarget.click()
    }
  }

  const handleMoodChange = (nextMood: string) => {
    /*
     * Popover 只负责选择体验，真正保存的仍是心情名称。
     */
    setMood(nextMood)
    setIsMoodPopoverOpen(false)
    markExistingDiaryChanged()
  }

  const handleTagCheckedChange = (tagName: string, checked: boolean) => {
    /*
     * Popover 勾选结果最终仍同步回 tagsInput，复用原来的保存与快照逻辑。
     */
    const nextTags = checked ? normalizeTagList([...selectedTags, tagName]) : selectedTags.filter(tag => tag !== tagName)

    setTagsInput(nextTags.join(', '))
    markExistingDiaryChanged()
  }

  const handleTagClose = (tagName: string) => {
    /*
     * 标签关闭按钮也回写 tagsInput，保证 Popover 勾选状态和已选标签保持同步。
     */
    const nextTags = selectedTags.filter(tag => tag !== tagName)

    setTagsInput(nextTags.join(', '))
    markExistingDiaryChanged()
  }

  const moodPopoverContent = (
    <div className={styles.moodPopoverContent}>
      {MOODS.map(moodOption => (
        <div
          key={moodOption.name}
          className={mood === moodOption.name ? `${styles.moodPopoverOption} ${styles.moodPopoverOptionActive}` : styles.moodPopoverOption}
          role="button"
          tabIndex={0}
          aria-pressed={mood === moodOption.name}
          onClick={() => handleMoodChange(moodOption.name)}
          onKeyDown={handlePickerTriggerKeyDown}
        >
          <span className={styles.moodPopoverEmoji}>{moodOption.emoji}</span>
          <span>{moodOption.name}</span>
        </div>
      ))}
      {mood ? (
        <div
          className={styles.moodPopoverClear}
          role="button"
          tabIndex={0}
          onClick={() => handleMoodChange('')}
          onKeyDown={handlePickerTriggerKeyDown}
        >
          不记录心情
        </div>
      ) : null}
    </div>
  )

  const tagPopoverContent = (
    <div className={styles.tagPopoverContent}>
      {selectableTags.length ? (
        selectableTags.map(tag => (
          <Checkbox
            key={tag.name}
            checked={selectedTags.includes(tag.name)}
            className={styles.tagPopoverCheckbox}
            onChange={event => handleTagCheckedChange(tag.name, event.target.checked)}
          >
            <span className={styles.tagOptionLabel}>
              <span className={styles.tagOptionDot} style={{ backgroundColor: tag.color }} />
              <span>{tag.name}</span>
            </span>
          </Checkbox>
        ))
      ) : (
        <span className={styles.tagPopoverEmpty}>暂无标签</span>
      )}
    </div>
  )

  /*
   * 编辑页只承载已有日记的修改体验。
   * 新日记由入口按钮先创建记录，再携带 id 跳转到这里。
   */
  return (
    <section className={className ? `${styles.editorPage} ${className}` : styles.editorPage}>
      <header className={styles.editorPageHeader}>
        <div className={styles.editorPageActions}>
          {/*
           * 内嵌在列表页时不显示返回入口，避免右侧编辑器影响左侧列表导航。
           */}
          {!embedded ? (
            <Button variant="text" type="text" onClick={() => navigate(-1)}>
              <ArrowLeftOutlined /> 返回
            </Button>
          ) : null}
        </div>
      </header>

      <Input
        className={styles.editorTitleInput}
        value={title}
        variant="borderless"
        placeholder="给这一天起个名字"
        size="large"
        prefix={<EditOutlined className="mr-10 text-black-65!" />}
        onChange={event => {
          setTitle(event.target.value)
          markExistingDiaryChanged()
        }}
      />

      <div className={styles.editorMetaRow}>
        <Popover
          content={moodPopoverContent}
          trigger="click"
          placement="bottomLeft"
          open={isMoodPopoverOpen}
          onOpenChange={setIsMoodPopoverOpen}
        >
          <Button icon={<SmileOutlined />}>
            {mood ? (
              <div className="flex items-center leading-none!">
                <span className="mood-name leading-none! mr-4">{selectedMood?.name}</span>
                <span className="mood-emoji text-size-18">{selectedMood?.emoji}</span>
              </div>
            ) : (
              '选择今天的心情'
            )}
          </Button>
        </Popover>

        <Space.Compact>
          <Popover content={tagPopoverContent} trigger="click" placement="bottomLeft">
            <Button icon={<TagsOutlined />}>选择标签</Button>
          </Popover>
          <Button icon={<SettingOutlined />} onClick={() => setIsTagManagerOpen(true)}></Button>
        </Space.Compact>

        {selectedTags.map(tagName => {
          const tagColor = tagColorMap.get(tagName) ?? DEFAULT_TAG_COLOR

          return (
            <Tag key={tagName} variant="outlined" color={tagColor} closable onClose={() => handleTagClose(tagName)}>
              #{tagName}
            </Tag>
          )
        })}
      </div>

      <TagManagerDialog open={isTagManagerOpen} onOpenChange={setIsTagManagerOpen} onTagsChanged={loadTagLibrary} />

      {loadError ? <p className={styles.editorPageError}>{loadError}</p> : null}

      <div className={styles.editorPageWorkspace}>
        {isEditorReady ? <div ref={editorRootRef} className={styles.editorPageMilkdown} /> : null}
      </div>

      <footer className={styles.editorPageFooter}>
        <span className={styles.editorPageStatus} aria-live="polite">
          {saveStatus}
          {lastSavedAt ? ` · 上次保存时间：${formatLastSavedAt(lastSavedAt)}` : ''}
        </span>

        {!embedded ? (
          <Button
            type="primary"
            shape="round"
            icon={<SaveOutlined />}
            style={{
              width: 120,
              height: 36
            }}
            disabled={isSaving || Boolean(loadError)}
            onClick={handleSaveDiary}
          >
            保存
          </Button>
        ) : null}
      </footer>
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

function isDiaryAssetPath(url: string): boolean {
  /*
   * 只有日记目录下的 assets/xxx 需要走本地资源读取；外链、data URL 和普通相对路径原样保留。
   */
  return /^assets\/[^/]+$/.test(url.trim())
}

function inferImageMimeType(fileName: string): string {
  /*
   * 部分剪贴板图片没有 MIME，这里按扩展名做轻量兜底。
   */
  const extension = fileName.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    default:
      return 'image/png'
  }
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
