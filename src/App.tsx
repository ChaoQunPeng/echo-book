import { EditOutlined, FieldTimeOutlined, QuestionCircleOutlined, ReadOutlined, SettingOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, ConfigProvider, Divider } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import styles from './App.module.scss'
import logoUrl from './assets/logo.svg'
import AboutDialog from './components/AboutDialog'
import { EchoThemeContext } from './contexts/EchoThemeContext'
import { createDefaultDiary } from './utils/diaryCreation'
import { applyEchoTheme, getEchoTheme, persistEchoThemeId, readStoredEchoThemeId } from './utils/theme'

const sidebarMenus = [
  {
    type: 'route',
    path: '/timeline',
    label: '时光',
    icon: FieldTimeOutlined
  },
  {
    type: 'route',
    path: '/list',
    label: '日记',
    icon: ReadOutlined
  }
  // {
  //   path: '/trash',
  //   label: '回收站',
  //   icon: DeleteOutlined
  // }
]

function App() {
  const [themeId, setThemeId] = useState(readStoredEchoThemeId)
  const activeTheme = getEchoTheme(themeId)

  useEffect(() => {
    /*
     * 每次主题变化都同步写入根 CSS 变量，保证侧边栏和页面背景立即跟随。
     */
    applyEchoTheme(themeId)
    persistEchoThemeId(themeId)
  }, [themeId])

  const appTheme = useMemo(() => {
    return {
      token: {
        colorPrimary: activeTheme.colors.primary,
        colorTextBase: activeTheme.colors.text,
        colorBgLayout: activeTheme.colors.page
      },
      components: {
        Button: {
          borderRadius: 24
        }
      }
    }
  }, [activeTheme])

  const themeContextValue = useMemo(
    () => ({
      themeId,
      setThemeId: (nextThemeId: typeof themeId) => setThemeId(nextThemeId)
    }),
    [themeId]
  )

  /*
   * AntdApp 提供 message/modal 等反馈 API 的上下文。
   * 这样动态主题能被弹框和提示消费，避免静态 API 的 context 警告。
   */
  return (
    <EchoThemeContext.Provider value={themeContextValue}>
      <ConfigProvider theme={appTheme}>
        <AntdApp>
          <AppLayout />
        </AntdApp>
      </ConfigProvider>
    </EchoThemeContext.Provider>
  )
}

function AppLayout() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [isCreatingDiary, setIsCreatingDiary] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const sidebarFooterMenus = [
    {
      type: 'route',
      path: '/settings',
      label: '设置',
      icon: SettingOutlined
    },
    {
      type: 'action',
      label: '关于爱可日记',
      icon: QuestionCircleOutlined,
      onClick: () => setIsAboutOpen(true)
    }
  ] as const

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
          <div className={`${styles.subtitle} text-black-65`}>echo book</div>
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

        <div className="ml-24 mr-24">
          <Divider className="mt-12! mb-32!" />
          <Button
            className="pr-26!"
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

        <div className="mt-auto pb-12">
          <nav className={styles.sideMenu} aria-label="主导航">
            {sidebarFooterMenus.map(menu => {
              const Icon = menu.icon

              // 👉 route 类型
              if (menu.type === 'route') {
                return (
                  <NavLink
                    key={menu.path!}
                    to={menu.path!}
                    className={({ isActive }) => (isActive ? `${styles.sideMenuItem} ${styles.sideMenuItemActive}` : styles.sideMenuItem)}
                  >
                    <Icon className="text-size-14 mr-12" />
                    <span className="text-size-14">{menu.label}</span>
                  </NavLink>
                )
              }

              // 👉 action 类型
              return (
                <div
                  key={menu.label}
                  className={`${styles.sideMenuItem} cursor-pointer`}
                  onClick={menu.onClick}
                  onKeyDown={event => {
                    /*
                     * 让侧边栏里的 action 项也能通过键盘打开弹框。
                     */
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      menu.onClick()
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <Icon className="text-size-14 mr-12" />
                  <span className="text-size-14">{menu.label}</span>
                </div>
              )
            })}
          </nav>
        </div>
      </aside>
      <div className={styles.mainContainer}>
        <Outlet />
      </div>
      <AboutDialog open={isAboutOpen} onOpenChange={setIsAboutOpen} />
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
