import { CloseOutlined, SettingOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import type { StorageInfo } from '../shared/settings'
import './App.scss'

const sidebarMenus = [
  {
    path: '/list',
    label: '日记列表1'
  },
  {
    path: '/editor',
    label: '编辑页面'
  }
]

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [settingsError, setSettingsError] = useState('')

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    let cancelled = false

    /*
     * 设置弹框打开时再读取路径，避免应用启动阶段做不必要的 IPC。
     * 返回值只用于展示，不让 renderer 获得文件系统写入能力。
     */
    if (!window.settingsAPI) {
      /*
       * 设置里的存储路径来自 Electron main process。
       * 纯浏览器环境没有 preload API，因此直接给出可理解的启动提示。
       */
      setStorageInfo(null)
      setSettingsError('请通过 Electron 启动应用后查看存放路径')
      return () => {
        cancelled = true
      }
    }

    window.settingsAPI
      .getStorageInfo()
      .then((info) => {
        if (!cancelled) {
          setStorageInfo(info)
          setSettingsError('')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettingsError('读取存放路径失败')
        }
      })

    return () => {
      cancelled = true
    }
  }, [isSettingsOpen])

  /*
   * `App` 负责承载整站固定布局：左侧导航区域和右侧主内容区域。
   * 主内容区域内部放置 React Router 的 `<Outlet />`，这样所有子路由
   * 都会统一渲染到 `.main-container` 中，避免不同页面重复编写外层布局。
   */
  return (
    <div className="app-shell">
      <aside className="side-bar">
        {/*
         * 左侧菜单只负责页面级导航，不承载具体业务内容。
         * 使用 NavLink 可以直接从 React Router 获得当前路由是否激活，
         * 从而给当前菜单项添加稳定的选中态。
         */}
        <nav className="side-menu" aria-label="主导航">
          {sidebarMenus.map(menu => (
            <NavLink
              key={menu.path}
              to={menu.path}
              className={({ isActive }) => (isActive ? 'side-menu__item side-menu__item--active' : 'side-menu__item')}
            >
              {menu.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="side-settings-button"
          type="button"
          onClick={() => setIsSettingsOpen(true)}
        >
          <SettingOutlined />
          设置
        </button>
      </aside>
      <div className="main-container">
        <Outlet />
      </div>

      {isSettingsOpen ? (
        <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="settings-modal__backdrop" onClick={() => setIsSettingsOpen(false)} />
          <section className="settings-modal__panel">
            <header className="settings-modal__header">
              <h2 id="settings-title">设置</h2>
              <button
                className="settings-modal__close"
                type="button"
                aria-label="关闭设置"
                onClick={() => setIsSettingsOpen(false)}
              >
                <CloseOutlined />
              </button>
            </header>

            <div className="settings-modal__body">
              {settingsError ? <p className="settings-modal__error">{settingsError}</p> : null}
              <label className="settings-field">
                <span>日记文件目录</span>
                <input readOnly value={storageInfo?.notesPath ?? '读取中...'} />
              </label>
              <label className="settings-field">
                <span>数据目录</span>
                <input readOnly value={storageInfo?.storageRoot ?? '读取中...'} />
              </label>
              <label className="settings-field">
                <span>数据库文件</span>
                <input readOnly value={storageInfo?.databasePath ?? '读取中...'} />
              </label>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
