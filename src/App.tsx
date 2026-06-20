import { EditOutlined, ExportOutlined, FolderOpenOutlined, LoadingOutlined, ReadOutlined, SettingOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, ConfigProvider, Divider, Form, Input, Modal } from 'antd'
import type { KeyboardEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { StorageInfo } from '../shared/settings'
import styles from './App.module.scss'
import logoUrl from './assets/logo.svg'
import { createDefaultDiary } from './utils/diaryCreation'

const sidebarMenus = [
  {
    path: '/list',
    label: '我的日记',
    icon: ReadOutlined
  },
  {
    path: '/',
    label: '设置',
    icon: ReadOutlined
  }
  // {
  //   path: '/trash',
  //   label: '回收站',
  //   icon: DeleteOutlined
  // }
]

function App() {
  const appTheme = useMemo(() => {
    /*
     * CSS 变量定义在 :root 上，因此这里从 document.documentElement 读取。
     * getPropertyValue 返回值可能带空格，所以需要 trim()。
     * fallback 用于防止变量未加载或浏览器环境异常时 antd 主题为空。
     */
    const colorPrimary = getComputedStyle(document.documentElement).getPropertyValue('--echo-color-primary').trim() || '#0f5238'

    return {
      token: {
        colorPrimary,
        // borderRadius: 16,
        boxShadow: 'none',
        components: {
          Button: {
            primaryShadow: 'none',
            borderRadius: 24
          }
        }
      }
    }

    // return {
    //   token: {
    //     // Seed Token, affects wide range
    //     colorPrimary: '#00b96b',
    //     borderRadius: 2,

    //     // Derived token, affects narrow range
    //     colorBgContainer: '#f6ffed'
    //   }
    // }
  }, [])

  /*
   * AntdApp 提供 message/modal 等反馈 API 的上下文。
   * 这样动态主题能被弹框和提示消费，避免静态 API 的 context 警告。
   */
  return (
    <ConfigProvider theme={appTheme}>
      <AntdApp>
        <AppLayout />
      </AntdApp>
    </ConfigProvider>
  )
}

function AppLayout() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [isCreatingDiary, setIsCreatingDiary] = useState(false)
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

  const handleCreateDiary = async () => {
    /*
     * 新日记按钮直接落库，然后进入带 id 的编辑页。
     */
    if (isCreatingDiary) {
      return
    }

    setIsCreatingDiary(true)

    try {
      const createdDiary = await createDefaultDiary()
      navigate(`/editor/${createdDiary.id}`)
    } catch (error) {
      message.error(`创建日记失败：${getErrorMessage(error)}`)
    } finally {
      setIsCreatingDiary(false)
    }
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

  const handleSideActionKeyDown = (event: KeyboardEvent<HTMLDivElement>, action: () => void, disabled = false) => {
    /*
     * div 模拟按钮时补齐键盘触发。
     * Enter 和空格都按原生按钮习惯执行操作。
     */
    if (disabled) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action()
    }
  }

  const handleExportBackup = () => {
    /*
     * 导出按钮只触发 preload 暴露的业务方法。
     * 保存位置选择、database/notes 目录打包、SQLite checkpoint 都在 main process 内完成。
     */
    if (isExportingBackup) {
      return
    }

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
   * 都会统一渲染到 `.mainContainer` 中，避免不同页面重复编写外层布局。
   */
  return (
    <div className={styles.appShell}>
      <aside className={styles.sideBar}>
        <div className={styles.logoGroup}>
          {/* 使用独立 logo 资源，避免品牌字样在组件中重复维护。 */}
          <img className={styles.logoImage} src={logoUrl} alt="爱可日记" />
          <div className={styles.subtitle}>爱生活，可记录</div>
        </div>
        {/*
           * 左侧菜单只负责页面级导航，不承载具体业务内容。
           * 使用 NavLink 可以直接从 React Router 获得当前路由是否激活，
           * 从而给当前菜单项添加稳定的选中态。
           */}
        <nav className={styles.sideMenu} aria-label="主导航">
          {sidebarMenus.map(menu => (
            <NavLink
              key={menu.path}
              to={menu.path}
              className={({ isActive }) => (isActive ? `${styles.sideMenuItem} ${styles.sideMenuItemActive}` : styles.sideMenuItem)}
            >
              {<menu.icon className="text-size-16 mr-12" />}
              {menu.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-16 mr-16">
          <Divider />
          <Button
            className="!pr-26"
            shape="round"
            type="primary"
            block
            size="large"
            icon={<EditOutlined />}
            loading={isCreatingDiary}
            onClick={handleCreateDiary}
          >
            <span>新日记</span>
          </Button>
        </div>

        <div className={styles.sideActions} aria-label="数据操作">
          <div
            className={`${styles.sideActionButton} ${isExportingBackup ? styles.sideActionButtonDisabled : ''}`}
            role="button"
            tabIndex={isExportingBackup ? -1 : 0}
            aria-busy={isExportingBackup}
            aria-disabled={isExportingBackup}
            onClick={handleExportBackup}
            onKeyDown={event => handleSideActionKeyDown(event, handleExportBackup, isExportingBackup)}
          >
            {isExportingBackup ? <LoadingOutlined className={styles.sideActionIcon} /> : <ExportOutlined className={styles.sideActionIcon} />}
            {isExportingBackup ? '导出中' : '导出'}
          </div>
          <div
            className={styles.sideActionButton}
            role="button"
            tabIndex={0}
            onClick={() => setIsSettingsOpen(true)}
            onKeyDown={event => handleSideActionKeyDown(event, () => setIsSettingsOpen(true))}
          >
            <SettingOutlined className={styles.sideActionIcon} />
            设置
          </div>
        </div>
      </aside>
      <div className={styles.mainContainer}>
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
        </Form>
      </Modal>
    </div>
  )
}

function getErrorMessage(error: unknown): string {
  /*
   * 统一压缩成短提示，方便直接放进 antd message。
   */
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '请稍后重试'
}

export default App
