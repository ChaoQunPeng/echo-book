import { SaveOutlined } from '@ant-design/icons'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { useEffect, useRef, useState } from 'react'
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
  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const initialMarkdownRef = useRef(readEditorDraft())
  const [saveStatus, setSaveStatus] = useState('草稿已就绪')

  useEffect(() => {
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
        window.localStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, markdown)
        setSaveStatus('已自动保存')
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
  }, [])

  const handleSaveDraft = () => {
    /*
     * 顶部按钮提供显式保存反馈。
     * 虽然正文已经自动保存，但用户点击按钮时从 Crepe 实例读取一次最新 Markdown，
     * 可以覆盖极短时间内还没触发 listener 的边界情况。
     */
    const markdown = crepeRef.current?.getMarkdown() ?? initialMarkdownRef.current

    window.localStorage.setItem(EDITOR_DRAFT_STORAGE_KEY, markdown)
    setSaveStatus('已手动保存')
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
          <h1>编辑日记</h1>
        </div>
        <div className="editor-page__actions">
          <span className="editor-page__status" aria-live="polite">
            {saveStatus}
          </span>
          <EchoButton icon={<SaveOutlined />} onClick={handleSaveDraft}>
            保存草稿
          </EchoButton>
        </div>
      </header>

      <div className="editor-page__workspace">
        <div ref={editorRootRef} className="editor-page__milkdown" />
      </div>
    </section>
  )
}

export default EditorPage
