import {
  ArrowLeftOutlined,
  BoldOutlined,
  CloudOutlined,
  CloseCircleOutlined,
  DownOutlined,
  FontSizeOutlined,
  FormOutlined,
  ItalicOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  SaveOutlined,
  SettingOutlined,
  SmileOutlined,
  TagsOutlined,
  UndoOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import { mergeAttributes, type NodeViewRendererProps } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Paragraph } from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Button, Checkbox, Dropdown, Input, Popover, Space, Tag, Tooltip, type MenuProps } from 'antd'
import type { ChangeEvent as ReactChangeEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Markdown, type MarkdownNodeSpec, type MarkdownStorage } from 'tiptap-markdown'
import { CLEARED_DIARY_TITLE_FALLBACK } from '../../../shared/defaultDiary'
import type { Diary } from '../../../shared/diary'
import { MOODS } from '../../../shared/moods'
import { WEATHERS } from '../../../shared/weather'
import type { TagLibraryItem } from '../../../shared/tags'
import TagManagerDialog from './TagManagerDialog'
import styles from './EditorPage.module.scss'

const DEFAULT_TAG_COLOR = '#237804'
const AUTO_SAVE_INTERVAL_MS = 60 * 1000
const DIARY_IMAGE_WIDTH_TITLE_PREFIX = 'echo-width:'
const HEADING_SIZE_OPTIONS = [
  { level: 1, label: '一级标题' },
  { level: 2, label: '二级标题' },
  { level: 3, label: '三级标题' }
] as const
type HeadingLevel = (typeof HEADING_SIZE_OPTIONS)[number]['level']

const HEADING_LEVELS: HeadingLevel[] = HEADING_SIZE_OPTIONS.map(option => option.level)
const PARAGRAPH_MENU_KEY = 'paragraph'
const WEATHER_NONE_OPTION = {
  name: '',
  label: '无',
  icon: <CloseCircleOutlined />
}
const METADATA_POPOVER_DIVIDER = {
  type: 'divider'
} as const
const EMPTY_PARAGRAPH_MARKDOWN = '&nbsp;'
const EMPTY_PARAGRAPH_TEXT = '\u00A0'

const DiaryParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: createDiaryParagraphMarkdownSpec()
    }
  }
})

type MetadataPopoverOption = { name: string; label?: string; icon?: ReactNode } | typeof METADATA_POPOVER_DIVIDER

type DiaryDraftFields = {
  title: string
  mood: string
  weather: string
  tagsInput: string
}

type SaveDraftReason = 'auto' | 'leave' | 'field-commit'

type SelectableTag = Pick<TagLibraryItem, 'name' | 'color'>

type EditorPageProps = {
  diaryId?: string
  embedded?: boolean
  showHeader?: boolean
  className?: string
  onDiarySaved?: (diary: Diary) => void
}

type DiaryImageUrlResolver = (url: string) => Promise<string>

function createDiaryParagraphMarkdownSpec(): MarkdownNodeSpec {
  return {
    serialize(state, node, parent) {
      const isEmptyParagraph = node.childCount === 0
      const isOnlyEmptyParagraph = parent.childCount === 1 && isEmptyParagraph

      if (isEmptyParagraph && !isOnlyEmptyParagraph) {
        /*
         * Markdown 会折叠连续空行；写入实体占位后，多敲的回车才能在保存后恢复。
         */
        state.write(EMPTY_PARAGRAPH_MARKDOWN)
        state.closeBlock(node)
        return
      }

      state.renderInline(node)
      state.closeBlock(node)
    },
    parse: {
      updateDOM(element) {
        /*
         * 读回保存的空段落占位时，把它还原成真正的空段落供 TipTap 编辑。
         */
        element.querySelectorAll('p').forEach(paragraph => {
          const paragraphText = paragraph.textContent ?? ''
          const hasOnlyEmptyMarker = paragraph.childNodes.length === 1 && paragraphText === EMPTY_PARAGRAPH_TEXT

          if (hasOnlyEmptyMarker) {
            paragraph.textContent = ''
          }
        })
      }
    }
  }
}

function createDiaryImageExtension(resolveImageUrl: DiaryImageUrlResolver) {
  return Image.extend({
    addStorage() {
      return {
        markdown: createDiaryImageMarkdownSpec()
      }
    },
    parseMarkdown(token, helpers) {
      /*
       * 图片宽度保存在 Markdown title 中，重新打开编辑器时恢复到节点属性。
       */
      const imageTitle = typeof token.title === 'string' ? token.title : ''
      const imageWidth = parseDiaryImageWidthTitle(imageTitle)

      return helpers.createNode('image', {
        src: token.href,
        alt: token.text,
        title: imageWidth === null ? token.title : null,
        width: imageWidth
      })
    },
    renderMarkdown(node) {
      /*
       * Markdown 图片语法没有标准宽度字段，用内部 title 标记持久化宽度。
       */
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      const title = serializeDiaryImageWidthTitle(node.attrs?.width) ?? (typeof node.attrs?.title === 'string' ? node.attrs.title : '')

      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
    },
    addNodeView() {
      if (typeof document === 'undefined') {
        return null
      }

      /*
       * 图片节点里保存 assets 相对路径，node view 只负责把它换成可预览的 data URL。
       */
      return props => createDiaryImageNodeView(props, resolveImageUrl)
    }
  })
}

function createDiaryImageMarkdownSpec(): MarkdownNodeSpec {
  return {
    serialize(state, node) {
      /*
       * tiptap-markdown 使用 storage.markdown 序列化，需在这里把 width 写回 Markdown。
       */
      const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
      const title = serializeDiaryImageWidthTitle(node.attrs?.width) ?? (typeof node.attrs?.title === 'string' ? node.attrs.title : '')

      state.write(`![${state.esc(alt)}](${src.replace(/[()]/g, '\\$&')}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`)
    },
    parse: {
      updateDOM(element) {
        /*
         * markdown-it 会先把图片 title 渲染成 DOM 属性，这里再恢复成 TipTap 节点 width。
         */
        element.querySelectorAll('img[title]').forEach(image => {
          const title = image.getAttribute('title') ?? ''
          const imageWidth = parseDiaryImageWidthTitle(title)

          if (imageWidth === null) {
            return
          }

          image.setAttribute('width', String(imageWidth))
          image.removeAttribute('title')
        })
      }
    }
  }
}

function createDiaryImageNodeView({ node, extension, editor, getPos }: NodeViewRendererProps, resolveImageUrl: DiaryImageUrlResolver) {
  let currentNode = node
  let isDestroyed = false
  let renderToken = 0
  let startWidth = 0
  let startPointerX = 0
  const wrapperElement = document.createElement('span')
  const imageElement = document.createElement('img')
  const resizeHandle = document.createElement('span')

  wrapperElement.className = styles.diaryImageNodeView
  resizeHandle.className = styles.diaryImageResizeHandle
  resizeHandle.setAttribute('role', 'presentation')
  wrapperElement.append(imageElement, resizeHandle)

  const renderImage = () => {
    const token = renderToken + 1
    renderToken = token
    const rawSrc = typeof currentNode.attrs.src === 'string' ? currentNode.attrs.src : ''
    const attributes = mergeAttributes(extension.options.HTMLAttributes, currentNode.attrs)

    /*
     * 重新应用属性，避免更新图片时残留旧的 alt/title/尺寸。
     */
    Array.from(imageElement.attributes).forEach(attribute => {
      imageElement.removeAttribute(attribute.name)
    })

    Object.entries(attributes).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return
      }

      imageElement.setAttribute(key, String(value))
    })

    applyDiaryImageWidth(imageElement, currentNode.attrs.width)

    if (!rawSrc) {
      return
    }

    void resolveImageUrl(rawSrc).then(resolvedSrc => {
      /*
       * 异步读取图片时可能已切换日记或更新节点，过期结果直接丢弃。
       */
      if (!isDestroyed && renderToken === token) {
        imageElement.src = resolvedSrc
      }
    })
  }

  const commitWidth = (width: number) => {
    const rawPos = getPos()

    /*
     * 拖拽结束后把像素宽度写回图片节点，触发 Markdown 序列化保存。
     */
    if (typeof rawPos !== 'number') {
      return
    }

    editor
      .chain()
      .focus()
      .setNodeSelection(rawPos)
      .updateAttributes('image', { width: Math.round(width) })
      .run()
  }

  const handlePointerMove = (event: PointerEvent) => {
    const nextWidth = Math.max(120, startWidth + event.clientX - startPointerX)
    imageElement.style.width = `${Math.round(nextWidth)}px`
  }

  const handlePointerUp = (event: PointerEvent) => {
    const nextWidth = imageElement.getBoundingClientRect().width
    const pointerId = event.pointerId

    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)

    if (resizeHandle.hasPointerCapture?.(pointerId)) {
      resizeHandle.releasePointerCapture(pointerId)
    }

    commitWidth(nextWidth)
  }

  resizeHandle.addEventListener('pointerdown', event => {
    /*
     * 只横向调整显示宽度，保持图片原始比例，避免日记图片被拉伸变形。
     */
    event.preventDefault()
    event.stopPropagation()
    startPointerX = event.clientX
    startWidth = imageElement.getBoundingClientRect().width
    resizeHandle.dataset.pointerId = String(event.pointerId)
    resizeHandle.setPointerCapture?.(event.pointerId)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  })

  renderImage()

  return {
    dom: wrapperElement,
    update(updatedNode: ProseMirrorNode) {
      if (updatedNode.type !== currentNode.type) {
        return false
      }

      currentNode = updatedNode
      renderImage()

      return true
    },
    destroy() {
      isDestroyed = true
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }
}

function EditorPage({ diaryId: providedDiaryId, embedded = false, showHeader = true, className = '', onDiarySaved }: EditorPageProps) {
  const navigate = useNavigate()
  const { diaryId: routeDiaryId } = useParams<{ diaryId: string }>()
  /*
   * 路由页面从 URL 读取 id；列表页内嵌时由父组件直接传入 id。
   */
  const diaryId = providedDiaryId ?? routeDiaryId
  const editorRef = useRef<Editor | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const initialMarkdownRef = useRef('')
  const latestMarkdownRef = useRef(initialMarkdownRef.current)
  const assetPreviewUrlCacheRef = useRef(new Map<string, string>())
  const latestFieldsRef = useRef<DiaryDraftFields>({
    title: '',
    mood: '',
    weather: '',
    tagsInput: ''
  })
  const lastPersistedSnapshotRef = useRef('')
  const isAutoSavingRef = useRef(false)
  const isManualSavingRef = useRef(false)
  const hasQueuedFieldCommitSaveRef = useRef(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [, setToolbarStateVersion] = useState(0)
  const [isEditorReady, setIsEditorReady] = useState(false)
  const [title, setTitle] = useState('')
  const [mood, setMood] = useState('')
  const [weather, setWeather] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [tagLibrary, setTagLibrary] = useState<TagLibraryItem[]>([])
  const [isMoodPopoverOpen, setIsMoodPopoverOpen] = useState(false)
  const [isWeatherPopoverOpen, setIsWeatherPopoverOpen] = useState(false)
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
  const isMoodSelected = mood.trim() !== ''
  const isWeatherSelected = weather.trim() !== ''

  const uploadDiaryImage = useCallback(
    async (file: File): Promise<string> => {
      /*
       * renderer 只读取图片二进制；真实落盘路径仍由 Electron main process 决定。
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
    },
    [diaryId]
  )

  const resolveDiaryImageUrl = useCallback(
    async (url: string): Promise<string> => {
      /*
       * Markdown 始终保存 assets 相对路径，编辑器 DOM 里才临时换成 data URL 预览。
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
    },
    [diaryId]
  )

  const diaryImageExtension = useMemo(() => createDiaryImageExtension(resolveDiaryImageUrl), [resolveDiaryImageUrl])

  const insertImageFiles = useCallback(
    async (files: File[]) => {
      const activeEditor = editorRef.current

      if (!activeEditor || !files.length) {
        return
      }

      for (const file of files) {
        const relativePath = await uploadDiaryImage(file)
        /*
         * 文档节点保留 assets/xxx.png，避免 Markdown 序列化时写入 Base64。
         */
        activeEditor.chain().focus().setImage({ src: relativePath, alt: '图片' }).run()
      }
    },
    [uploadDiaryImage]
  )

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          /*
           * 日记编辑器只保留轻量写作格式，禁用代码相关能力。
           */
          code: false,
          codeBlock: false,
          paragraph: false,
          heading: {
            /*
             * 标题大小只开放三档，和工具栏里的 26/22/18 对应。
             */
            levels: HEADING_LEVELS
          }
        }),
        Markdown.configure({
          html: false,
          linkify: true,
          /*
           * 读取旧 Markdown 时保留单换行，避免历史正文重新打开后被并到同一段。
           */
          breaks: true,
          tightLists: true
        }),
        DiaryParagraph,
        diaryImageExtension,
        Link.configure({
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank'
          }
        }),
        Placeholder.configure({
          placeholder: '写下这一刻...'
        }),
        TaskList,
        TaskItem.configure({
          nested: true
        })
      ],
      content: initialMarkdownRef.current,
      editable: isEditorReady && !loadError,
      immediatelyRender: false,
      textDirection: 'auto',
      editorProps: {
        attributes: {
          class: styles.tiptapProseMirror,
          'aria-label': '日记正文'
        },
        handlePaste(_view, event) {
          const files = getImageFilesFromDataTransfer(event.clipboardData)

          if (!files.length) {
            return false
          }

          event.preventDefault()
          void insertImageFiles(files)
          return true
        },
        handleDrop(_view, event) {
          const files = getImageFilesFromDataTransfer(event.dataTransfer)

          if (!files.length) {
            return false
          }

          event.preventDefault()
          void insertImageFiles(files)
          return true
        }
      },
      onCreate({ editor: createdEditor }) {
        editorRef.current = createdEditor

        if (isEditorReady) {
          setSaveStatus('日记已载入')
        }
      },
      onTransaction() {
        /*
         * undo/redo 的可用状态来自 history plugin，需要每次编辑器 transaction 后刷新工具栏。
         */
        setToolbarStateVersion(version => version + 1)
      },
      onUpdate({ editor: updatedEditor }) {
        const markdown = readEditorMarkdown(updatedEditor) ?? ''
        latestMarkdownRef.current = markdown

        const currentSnapshot = buildDiarySnapshot({
          ...latestFieldsRef.current,
          markdown
        })

        if (currentSnapshot !== lastPersistedSnapshotRef.current) {
          setSaveStatus('有未保存更改')
        }
      }
    },
    [diaryId, diaryImageExtension, editorVersion, insertImageFiles, isEditorReady, loadError]
  )

  useEffect(() => {
    editorRef.current = editor

    return () => {
      /*
       * TipTap 由 React 托管销毁；卸载前只同步一次 Markdown 缓存。
       */
      latestMarkdownRef.current = readEditorMarkdown(editor) ?? latestMarkdownRef.current

      if (editorRef.current === editor) {
        editorRef.current = null
      }
    }
  }, [editor])

  const getCurrentMarkdown = useCallback((): string => {
    /*
     * 所有保存入口都从这里读取 Markdown，保持手动保存、自动保存和导出前状态一致。
     */
    const markdown = readEditorMarkdown(editorRef.current) ?? latestMarkdownRef.current
    latestMarkdownRef.current = markdown

    return markdown
  }, [])

  useEffect(() => {
    let cancelled = false

    /*
     * EditorPage 只编辑已经创建好的日记。
     * 路由 id 变化时重置表单和 Markdown 初始值，再用 editorVersion 触发 TipTap 重建。
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
      setWeather('')
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
          weather: diary.weather ?? '',
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
        setWeather(diary.weather ?? '')
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
      weather,
      tagsInput
    }
  }, [mood, tagsInput, title, weather])

  const saveExistingDiaryDraft = useCallback(
    async (reason: SaveDraftReason) => {
      const shouldUpdateStatus = reason !== 'leave'
      const isFieldCommit = reason === 'field-commit'

      if (!diaryId || !isEditorReady || loadError) {
        return
      }

      if (isAutoSavingRef.current || isManualSavingRef.current) {
        /*
         * 连续点选标签时，当前保存可能还没结束；排队补一次即可写入最新字段。
         */
        if (isFieldCommit) {
          hasQueuedFieldCommitSaveRef.current = true
        }

        return
      }

      const fields = latestFieldsRef.current
      const markdown = getCurrentMarkdown()
      const snapshot = buildDiarySnapshot({
        ...fields,
        markdown
      })

      if (snapshot === lastPersistedSnapshotRef.current) {
        return
      }

      const normalizedTitle = normalizeDiaryTitle(fields.title)
      const isTitleEmpty = fields.title.trim() === ''

      if (isFieldCommit && isTitleEmpty) {
        /*
         * 失焦提交时把空标题回填到输入框，让界面和已保存标题保持一致。
         */
        latestFieldsRef.current = {
          ...latestFieldsRef.current,
          title: normalizedTitle
        }
        setTitle(normalizedTitle)
      }

      isAutoSavingRef.current = true

      if (shouldUpdateStatus) {
        setSaveStatus(isFieldCommit ? '正在保存' : '正在自动保存')
      }

      try {
        if (!window.diaryAPI) {
          /*
           * 所有草稿保存都必须走主进程，避免 renderer 直接碰本地文件。
           * 空正文日记也要保存标题、心情、天气和标签。
           */
          throw new Error('Electron diary API is unavailable.')
        }

        /*
         * 元数据保存要显式区分“未选择”和真实枚举值。
         */
        const trimmedMood = fields.mood.trim()
        const trimmedWeather = fields.weather.trim()
        const hasMood = trimmedMood !== ''
        const hasWeather = trimmedWeather !== ''

        const updatedDiary = await window.diaryAPI.updateDiary({
          id: diaryId,
          title: normalizedTitle,
          markdown,
          mood: hasMood ? fields.mood : null,
          weather: hasWeather ? fields.weather : null,
          tags: parseTags(fields.tagsInput)
        })

        lastPersistedSnapshotRef.current = snapshot
        /*
         * 保存成功后只通知父级替换当前日记元数据。
         */
        onDiarySaved?.(updatedDiary)

        const latestSnapshot = buildDiarySnapshot({
          ...latestFieldsRef.current,
          markdown: getCurrentMarkdown()
        })

        if (shouldUpdateStatus) {
          setSaveStatus(latestSnapshot === snapshot ? (isFieldCommit ? '已保存' : '已自动保存') : '有未保存更改')
          setLastSavedAt(updatedDiary.updatedAt)
        }
      } catch (error) {
        console.error('Failed to save diary draft:', error)

        if (shouldUpdateStatus) {
          setSaveStatus(`${isFieldCommit ? '保存' : '自动保存'}失败：${getErrorMessage(error)}`)
        }
      } finally {
        isAutoSavingRef.current = false

        if (hasQueuedFieldCommitSaveRef.current) {
          /*
           * 保存期间发生的字段提交在这里串行补保存，避免旧快照覆盖最新标签。
           */
          hasQueuedFieldCommitSaveRef.current = false
          void saveExistingDiaryDraft('field-commit')
        }
      }
    },
    [diaryId, getCurrentMarkdown, isEditorReady, loadError, onDiarySaved]
  )

  useEffect(() => {
    if (!diaryId || !isEditorReady || loadError) {
      return
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
  }, [diaryId, isEditorReady, loadError, saveExistingDiaryDraft])

  const handleSaveDiary = async () => {
    /*
     * 提交前从 TipTap 读取最新 Markdown。
     * 创建动作已经在入口完成，这里只负责更新当前日记。
     */
    const markdown = getCurrentMarkdown()
    const normalizedTitle = normalizeDiaryTitle(title)
    const isTitleEmpty = title.trim() === ''

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

    if (isTitleEmpty) {
      /*
       * 手动保存允许正文为空，但空标题仍回填默认名，避免列表出现空白标题。
       */
      latestFieldsRef.current = {
        ...latestFieldsRef.current,
        title: normalizedTitle
      }
      setTitle(normalizedTitle)
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

      /*
       * 手动保存和自动保存保持同一套空值归一规则。
       */
      const trimmedMood = mood.trim()
      const trimmedWeather = weather.trim()
      const hasMood = trimmedMood !== ''
      const hasWeather = trimmedWeather !== ''

      const updatedDiary = await window.diaryAPI.updateDiary({
        id: diaryId,
        title: normalizedTitle,
        markdown,
        mood: hasMood ? mood : null,
        weather: hasWeather ? weather : null,
        tags: parseTags(tagsInput)
      })

      const savedSnapshot = buildDiarySnapshot({
        title: normalizedTitle,
        mood,
        weather,
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
        markdown: getCurrentMarkdown()
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

      if (hasQueuedFieldCommitSaveRef.current) {
        /*
         * 手动保存期间发生的字段提交也要补写，保证标签最终立即落库落盘。
         */
        hasQueuedFieldCommitSaveRef.current = false
        void saveExistingDiaryDraft('field-commit')
      }
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

  const handleTitleChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.target.value

    /*
     * ref 立即同步，保证紧接着失焦时能保存最新标题。
     */
    latestFieldsRef.current = {
      ...latestFieldsRef.current,
      title: nextTitle
    }
    setTitle(nextTitle)
    markExistingDiaryChanged()
  }

  const handleTitleBlur = () => {
    /*
     * 标题失焦时主动保存一次，左侧列表只做局部更新。
     */
    void saveExistingDiaryDraft('field-commit')
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
    latestFieldsRef.current = {
      ...latestFieldsRef.current,
      mood: nextMood
    }
    setMood(nextMood)
    setIsMoodPopoverOpen(false)
    markExistingDiaryChanged()
    void saveExistingDiaryDraft('field-commit')
  }

  const handleWeatherChange = (nextWeather: string) => {
    /*
     * 天气和心情一样，只保存枚举名称，展示层直接显示名称。
     */
    latestFieldsRef.current = {
      ...latestFieldsRef.current,
      weather: nextWeather
    }
    setWeather(nextWeather)
    setIsWeatherPopoverOpen(false)
    markExistingDiaryChanged()
    void saveExistingDiaryDraft('field-commit')
  }

  const commitSelectedTags = (nextTags: string[]) => {
    const nextTagsInput = nextTags.join(', ')

    /*
     * 先写 ref 再触发保存，确保 IPC 读取到刚刚选择或移除的标签。
     */
    latestFieldsRef.current = {
      ...latestFieldsRef.current,
      tagsInput: nextTagsInput
    }
    setTagsInput(nextTagsInput)
    markExistingDiaryChanged()
    void saveExistingDiaryDraft('field-commit')
  }

  const handleTagCheckedChange = (tagName: string, checked: boolean) => {
    /*
     * Popover 勾选结果最终仍同步回 tagsInput，复用原来的保存与快照逻辑。
     */
    const nextTags = checked ? normalizeTagList([...selectedTags, tagName]) : selectedTags.filter(tag => tag !== tagName)

    commitSelectedTags(nextTags)
  }

  const handleTagClose = (tagName: string) => {
    /*
     * 标签关闭按钮也回写 tagsInput，保证 Popover 勾选状态和已选标签保持同步。
     */
    const nextTags = selectedTags.filter(tag => tag !== tagName)

    commitSelectedTags(nextTags)
  }

  const isToolbarDisabled = !editor || !isEditorReady || Boolean(loadError)
  const canUndo = Boolean(editor && !isToolbarDisabled && editor.can().chain().undo().run())
  const canRedo = Boolean(editor && !isToolbarDisabled && editor.can().chain().redo().run())
  const activeHeadingLevel = HEADING_LEVELS.find(level => editor?.isActive('heading', { level })) ?? null
  const activeHeadingOption = HEADING_SIZE_OPTIONS.find(option => option.level === activeHeadingLevel) ?? null
  const isParagraphActive = Boolean(editor?.isActive('paragraph'))
  const selectedHeadingMenuKeys = resolveSelectedHeadingMenuKeys(activeHeadingLevel, isParagraphActive)
  const headingMenuItems: MenuProps['items'] = [
    ...HEADING_SIZE_OPTIONS.map(option => ({
      key: String(option.level),
      label: option.label
    })),
    {
      type: 'divider'
    },
    {
      key: PARAGRAPH_MENU_KEY,
      label: '正文'
    }
  ]

  const handleEditorToolbarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    /*
     * 工具栏按钮不抢走编辑器焦点，撤销后立刻重做时 history 状态更稳定。
     */
    event.preventDefault()
  }

  const handleUndo = () => {
    editor?.chain().focus().undo().run()
  }

  const handleRedo = () => {
    editor?.chain().focus().redo().run()
  }

  const handleToggleHeading = (level: HeadingLevel) => {
    /*
     * 标题下拉只改变当前块级段落，和正文 mark 选区逻辑分开处理。
     */
    editor?.chain().focus().toggleHeading({ level }).run()
  }

  const handleHeadingMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === PARAGRAPH_MENU_KEY) {
      /*
       * “正文”是清除标题的显式入口，避免用户需要再点一次当前标题来取消。
       */
      editor?.chain().focus().setParagraph().run()
      return
    }

    const level = Number(key) as HeadingLevel

    /*
     * Dropdown 的 key 来自固定标题级别，执行前仍做一次轻量兜底。
     */
    if (HEADING_LEVELS.includes(level)) {
      handleToggleHeading(level)
    }
  }

  const handleToggleBold = () => {
    if (!editor) {
      return
    }

    selectWordAroundCursor(editor)
    editor.chain().focus().toggleBold().run()
  }

  const handleToggleItalic = () => {
    if (!editor) {
      return
    }

    selectWordAroundCursor(editor)
    editor.chain().focus().toggleItalic().run()
  }

  const handleToggleBulletList = () => {
    editor?.chain().focus().toggleBulletList().run()
  }

  const handleToggleOrderedList = () => {
    editor?.chain().focus().toggleOrderedList().run()
  }

  const handleImageInputChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const files = getImageFilesFromFileList(event.target.files)
    event.target.value = ''

    if (!files.length) {
      return
    }

    void insertImageFiles(files)
  }

  const moodPopoverContent = renderMetadataPopoverContent({
    options: MOODS,
    selectedValue: mood,
    onSelect: handleMoodChange,
    onKeyDown: handlePickerTriggerKeyDown
  })

  const weatherPopoverContent = renderMetadataPopoverContent({
    /*
     * 天气允许主动清空，保存时会落成 null 并从列表/预览中隐藏。
     */
    options: [...WEATHERS, METADATA_POPOVER_DIVIDER, WEATHER_NONE_OPTION],
    selectedValue: weather,
    onSelect: handleWeatherChange,
    onKeyDown: handlePickerTriggerKeyDown
  })

  const tagPopoverContent = (
    <div className="flex max-h-260 min-w-220 flex-col gap-6 overflow-auto">
      {selectableTags.length ? (
        selectableTags.map(tag => (
          <Checkbox
            key={tag.name}
            checked={selectedTags.includes(tag.name)}
            onChange={event => handleTagCheckedChange(tag.name, event.target.checked)}
          >
            <div className="flex items-center">
              <span className="leading-none!">{tag.name}</span>
              <span className="inline-flex h-12 w-12 ml-6 rounded-full" style={{ backgroundColor: tag.color }} />
            </div>
          </Checkbox>
        ))
      ) : (
        <span className="text-size-14 text-color-base-45">暂无标签</span>
      )}
    </div>
  )

  /*
   * 编辑页只承载已有日记的修改体验。
   * 新日记由入口按钮先创建记录，再携带 id 跳转到这里。
   */
  return (
    <section className={['flex h-full flex-col', className].filter(Boolean).join(' ')}>
      {showHeader ? (
        <header className="flex p-12">
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-12">
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
      ) : null}

      <div className="ml-12">
        <Input
          className="h-52 pl-0 pt-0! text-size-22!"
          value={title}
          variant="borderless"
          placeholder="给这一天起个名字"
          size="large"
          prefix={<FormOutlined className="mr-8 text-color-base-65! text-size-18" />}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
        />
      </div>

      <div className="flex flex-wrap items-center gap-12 border-b border-primary-soft pb-16 pl-20 pr-20">
        <Popover
          content={moodPopoverContent}
          trigger="click"
          placement="bottomLeft"
          open={isMoodPopoverOpen}
          onOpenChange={setIsMoodPopoverOpen}
        >
          <Button icon={<SmileOutlined />}>
            {isMoodSelected ? (
              <div className="flex items-center leading-none!">
                <span className="mood-name leading-none!">{mood}</span>
              </div>
            ) : (
              '选择今天的心情'
            )}
          </Button>
        </Popover>

        <Popover
          content={weatherPopoverContent}
          trigger="click"
          placement="bottomLeft"
          open={isWeatherPopoverOpen}
          onOpenChange={setIsWeatherPopoverOpen}
        >
          <Button icon={<CloudOutlined />}>
            {isWeatherSelected ? (
              <div className="flex items-center leading-none!">
                <span className="mood-name leading-none!">{weather}</span>
              </div>
            ) : (
              '选择天气'
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

      {loadError ? <p className="text-size-13 leading-[1.5] text-[#b42318]">{loadError}</p> : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {isEditorReady ? (
          <>
            {editor ? (
              <div
                className="flex flex-wrap items-center gap-6 border-b border-primary-soft bg-page px-20 py-8"
                role="toolbar"
                aria-label="TipTap Simple editor 工具栏"
                onMouseDown={handleEditorToolbarMouseDown}
              >
                {/*
                 * Simple editor 是固定基础工具栏，这里用 TipTap commands 直接驱动编辑器。
                 */}
                <Tooltip title="撤销">
                  <Button icon={<UndoOutlined />} disabled={!canUndo} onClick={handleUndo} />
                </Tooltip>
                <Tooltip title="重做">
                  <Button icon={<RedoOutlined />} disabled={!canRedo} onClick={handleRedo} />
                </Tooltip>
                <span className="mx-2 h-22 w-1 bg-primary-soft" aria-hidden="true" />
                <Tooltip title="标题大小">
                  <Dropdown
                    disabled={isToolbarDisabled}
                    menu={{
                      items: headingMenuItems,
                      selectedKeys: selectedHeadingMenuKeys,
                      onClick: handleHeadingMenuClick
                    }}
                    trigger={['click']}
                  >
                    <Button icon={<FontSizeOutlined />} disabled={isToolbarDisabled} type={activeHeadingLevel ? 'primary' : 'default'}>
                      {activeHeadingOption ? activeHeadingOption.label : '正文'} <DownOutlined />
                    </Button>
                  </Dropdown>
                </Tooltip>
                <Tooltip title="加粗">
                  <Button
                    icon={<BoldOutlined />}
                    disabled={isToolbarDisabled}
                    type={editor.isActive('bold') ? 'primary' : 'default'}
                    onClick={handleToggleBold}
                  />
                </Tooltip>
                <Tooltip title="斜体">
                  <Button
                    icon={<ItalicOutlined />}
                    disabled={isToolbarDisabled}
                    type={editor.isActive('italic') ? 'primary' : 'default'}
                    onClick={handleToggleItalic}
                  />
                </Tooltip>
                <span className="mx-2 h-22 w-1 bg-primary-soft" aria-hidden="true" />
                <Tooltip title="无序列表">
                  <Button
                    icon={<UnorderedListOutlined />}
                    disabled={isToolbarDisabled}
                    type={editor.isActive('bulletList') ? 'primary' : 'default'}
                    onClick={handleToggleBulletList}
                  />
                </Tooltip>
                <Tooltip title="有序列表">
                  <Button
                    icon={<OrderedListOutlined />}
                    disabled={isToolbarDisabled}
                    type={editor.isActive('orderedList') ? 'primary' : 'default'}
                    onClick={handleToggleOrderedList}
                  />
                </Tooltip>
                {/* <Tooltip title="任务列表">
                  <Button
                    icon={<CheckSquareOutlined />}
                    disabled={isToolbarDisabled}
                    type={editor.isActive('taskList') ? 'primary' : 'default'}
                    onClick={handleToggleTaskList}
                  />
                </Tooltip> */}
                <Tooltip title="插入图片">
                  <Button icon={<PictureOutlined />} disabled={isToolbarDisabled} onClick={() => imageInputRef.current?.click()} />
                </Tooltip>
              </div>
            ) : null}
            <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={handleImageInputChange} />
            <EditorContent
              editor={editor}
              className={`${styles.editorContent} min-h-[inherit] flex-1 overflow-auto font-[inherit] text-color-base`}
            />
          </>
        ) : null}
      </div>

      <footer className="flex items-center justify-between border-t px-20 py-16">
        <span className="text-size-13 leading-[1.4] text-[rgba(25,28,29,0.62)]" aria-live="polite">
          {saveStatus}
          {lastSavedAt ? ` · 上次保存时间：${formatLastSavedAt(lastSavedAt)}` : ''}
        </span>

        <Button
          type="primary"
          shape="round"
          icon={<SaveOutlined />}
          style={{
            width: 100,
            height: 36
          }}
          disabled={isSaving || Boolean(loadError)}
          onClick={handleSaveDiary}
        >
          保存
        </Button>
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

function resolveSelectedHeadingMenuKeys(activeHeadingLevel: HeadingLevel | null, isParagraphActive: boolean): string[] {
  /*
   * 标题菜单需要把正文也当成可选项，列表等块类型则不高亮任何项。
   */
  if (activeHeadingLevel !== null) {
    return [String(activeHeadingLevel)]
  }

  if (isParagraphActive) {
    return [PARAGRAPH_MENU_KEY]
  }

  return []
}

function renderMetadataPopoverContent({
  options,
  selectedValue,
  onSelect,
  onKeyDown
}: {
  options: ReadonlyArray<MetadataPopoverOption>
  selectedValue: string
  onSelect: (value: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}) {
  return (
    <div className="flex min-w-180 flex-col gap-4">
      {options.map((option, optionIndex) => {
        if (isMetadataPopoverDivider(option)) {
          /*
           * 清空入口和真实枚举项分组，避免误以为它也是一种天气。
           */
          return <div key={`divider-${optionIndex}`} className="my-4 border-t border-primary-soft" role="separator" />
        }

        const optionLabel = option.label ?? option.name
        const isSelected = selectedValue === option.name
        /*
         * 清空这类操作项保留图标，真实元数据项只展示名称。
         */
        const optionIcon = option.icon
        const hasOptionIcon = optionIcon !== undefined && optionIcon !== null

        return (
          <div
            key={optionLabel}
            className={[
              'flex min-h-32 cursor-pointer items-center gap-8 rounded-[6px] px-8 py-5 text-color-base outline-none hover:bg-base-hover focus-visible:bg-base-hover',
              isSelected ? 'bg-primary-soft font-bold text-primary' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => onSelect(option.name)}
            onKeyDown={onKeyDown}
          >
            {hasOptionIcon ? <span className="w-20 text-center">{optionIcon}</span> : null}
            <span>{optionLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

function isMetadataPopoverDivider(option: MetadataPopoverOption): option is typeof METADATA_POPOVER_DIVIDER {
  /*
   * 元数据弹层的分割线是展示项，不参与选择和保存。
   */
  return 'type' in option && option.type === 'divider'
}

function selectWordAroundCursor(editor: Editor): boolean {
  const { selection } = editor.state

  if (!selection.empty) {
    return false
  }

  const { $from } = selection
  const text = $from.parent.textContent

  if (!$from.parent.isTextblock || !text) {
    return false
  }

  let start = $from.parentOffset
  let end = $from.parentOffset

  /*
   * 空选区点工具栏时，优先选中光标左侧或所在位置的连续文字。
   */
  while (start > 0 && /\S/.test(text[start - 1] ?? '')) {
    start -= 1
  }

  while (end < text.length && /\S/.test(text[end] ?? '')) {
    end += 1
  }

  if (start === end) {
    return false
  }

  editor.commands.setTextSelection({
    from: $from.start() + start,
    to: $from.start() + end
  })

  return true
}

function readEditorMarkdown(editor: Editor | null): string | null {
  /*
   * tiptap-markdown 把序列化能力挂在 storage.markdown 上，这里集中做空值兜底。
   */
  const markdownStorage = (editor?.storage as { markdown?: MarkdownStorage } | undefined)?.markdown

  return markdownStorage?.getMarkdown() ?? null
}

function parseDiaryImageWidthTitle(title: string): number | null {
  /*
   * 只识别本编辑器写入的尺寸标记，普通图片 title 保持原样。
   */
  if (!title.startsWith(DIARY_IMAGE_WIDTH_TITLE_PREFIX)) {
    return null
  }

  const width = Number(title.slice(DIARY_IMAGE_WIDTH_TITLE_PREFIX.length))

  return Number.isFinite(width) && width > 0 ? Math.round(width) : null
}

function serializeDiaryImageWidthTitle(width: unknown): string | null {
  const normalizedWidth = typeof width === 'number' ? width : Number(width)

  if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0) {
    return null
  }

  return `${DIARY_IMAGE_WIDTH_TITLE_PREFIX}${Math.round(normalizedWidth)}`
}

function applyDiaryImageWidth(image: HTMLImageElement, width: unknown) {
  const normalizedWidth = typeof width === 'number' ? width : Number(width)

  /*
   * 图片宽度只限制最大显示尺寸，容器变窄时仍能响应式缩小。
   */
  image.style.width = Number.isFinite(normalizedWidth) && normalizedWidth > 0 ? `${Math.round(normalizedWidth)}px` : ''
  image.style.height = ''
}

function getImageFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  /*
   * 粘贴和拖拽共用一套图片过滤逻辑，只接受 image/* 文件。
   */
  if (!dataTransfer) {
    return []
  }

  return getImageFilesFromFileList(dataTransfer.files)
}

function getImageFilesFromFileList(fileList: FileList | null): File[] {
  /*
   * input.files / DataTransfer.files 都是 FileList，转成数组后方便顺序插入。
   */
  if (!fileList) {
    return []
  }

  return Array.from(fileList).filter(file => file.type.startsWith('image/') || isSupportedImageFileName(file.name))
}

function isSupportedImageFileName(fileName: string): boolean {
  /*
   * 有些系统拖拽文件时 MIME 为空，按常见图片后缀补一次判断。
   */
  return /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(fileName)
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
    title: normalizeDiaryTitle(input.title),
    mood: input.mood.trim(),
    weather: input.weather.trim(),
    tags: parseTags(input.tagsInput),
    markdown: input.markdown
  })
}

function normalizeDiaryTitle(title: string): string {
  /*
   * 用户清空标题时保存为固定兜底名，避免列表出现空白标题。
   */
  const normalizedTitle = title.trim()

  return normalizedTitle || CLEARED_DIARY_TITLE_FALLBACK
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
