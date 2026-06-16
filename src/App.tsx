import { ExportOutlined, FolderOpenOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, Button, ConfigProvider, Form, Input, Modal, message } from 'antd'
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
  const [isOpeningStorageRoot, setIsOpeningStorageRoot] = useState(false)
  const [isExportingBackup, setIsExportingBackup] = useState(false)

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
      .then(info => {
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

  const handleCloseSettings = () => {
    setIsSettingsOpen(false)
  }

  const handleOpenStorageRoot = () => {
    /*
     * “打开目录”同样只走 preload 暴露的业务 API。
     * 浏览器调试环境没有 Electron shell 能力，因此这里复用设置页的错误提示区域。
     */
    if (!window.settingsAPI) {
      setSettingsError('请通过 Electron 启动应用后打开存储目录')
      return
    }

    setIsOpeningStorageRoot(true)
    window.settingsAPI
      .openStorageRoot()
      .then(() => {
        setSettingsError('')
      })
      .catch(() => {
        setSettingsError('打开存储目录失败')
      })
      .finally(() => {
        setIsOpeningStorageRoot(false)
      })
  }

  const handleExportBackup = () => {
    /*
     * 导出按钮只触发 preload 暴露的业务方法。
     * 保存位置选择、database/notes 目录打包、SQLite checkpoint 都在 main process 内完成。
     */
    if (!window.settingsAPI) {
      message.error('请通过 Electron 启动应用后导出备份')
      return
    }

    setIsExportingBackup(true)
    window.settingsAPI
      .exportBackup()
      .then(result => {
        if (!result.canceled) {
          message.success('导出完成')
        }
      })
      .catch(() => {
        message.error('导出备份失败')
      })
      .finally(() => {
        setIsExportingBackup(false)
      })
  }

  /*
   * `App` 负责承载整站固定布局：左侧导航区域和右侧主内容区域。
   * 主内容区域内部放置 React Router 的 `<Outlet />`，这样所有子路由
   * 都会统一渲染到 `.main-container` 中，避免不同页面重复编写外层布局。
   */
  return (
    // theme={{ token: { colorPrimary: '#00b96b' } }}
    <ConfigProvider>
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
          <div className="side-actions" aria-label="数据操作">
            <button
              className="side-action-button"
              type="button"
              disabled={isExportingBackup}
              aria-busy={isExportingBackup}
              onClick={handleExportBackup}
            >
              <ExportOutlined />
              {isExportingBackup ? '导出中' : '导出'}
            </button>
            <button className="side-action-button" type="button" onClick={() => setIsSettingsOpen(true)}>
              <SettingOutlined />
              设置
            </button>
          </div>
        </aside>
        <div className="main-container">
          <Outlet />
        </div>

        <Modal
          title="设置"
          centered
          open={isSettingsOpen}
          onCancel={handleCloseSettings}
          footer={[
            <Button
              key="open-storage-root"
              type="primary"
              icon={<FolderOpenOutlined />}
              loading={isOpeningStorageRoot}
              disabled={!storageInfo || Boolean(settingsError)}
              onClick={handleOpenStorageRoot}
            >
              打开存储目录
            </Button>,
            <Button key="close-settings" onClick={handleCloseSettings}>
              关闭
            </Button>
          ]}
        >
          {/*
           * 设置项当前只展示 main process 计算出的真实路径。
           * Input 使用 readOnly 而不是 disabled，让用户仍然可以选中复制路径。
           */}
          <Form layout="vertical">
            {settingsError ? (
              <Form.Item>
                <Alert message={settingsError} type="error" showIcon />
              </Form.Item>
            ) : null}
            <Form.Item label="日记文件目录">
              <Input readOnly value={storageInfo?.notesPath ?? '读取中...'} />
            </Form.Item>
            {/* <Form.Item label="数据目录">
              <Input readOnly value={storageInfo?.storageRoot ?? '读取中...'} />
            </Form.Item>
            <Form.Item label="数据库目录">
              <Input readOnly value={storageInfo?.databaseDirectoryPath ?? '读取中...'} />
            </Form.Item>
            <Form.Item label="数据库文件">
              <Input readOnly value={storageInfo?.databasePath ?? '读取中...'} />
            </Form.Item> */}
          </Form>
        </Modal>
      </div>
    </ConfigProvider>
  )
}

export default App
