import { ClockCircleOutlined, EditOutlined, ReadOutlined, SettingOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, ConfigProvider, Divider } from 'antd'
import { useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
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
    path: '/timeline',
    label: '时光',
    icon: ClockCircleOutlined
  },
  {
    path: '/settings',
    label: '设置',
    icon: SettingOutlined
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
        components: {
          Button: {
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
  const [isCreatingDiary, setIsCreatingDiary] = useState(false)

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
      </aside>
      <div className={styles.mainContainer}>
        <Outlet />
      </div>
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
