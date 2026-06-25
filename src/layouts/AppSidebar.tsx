import { EditOutlined, ExportOutlined, FieldTimeOutlined, QuestionCircleOutlined, ReadOutlined, SettingOutlined } from '@ant-design/icons'
import { App as AntdApp, Button, Divider } from 'antd'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import logoUrl from '../assets/logo.svg'
import AboutDialog from '../components/AboutDialog'
import { createDefaultDiary } from '../utils/diaryCreation'
import styles from './AppShellLayout.module.scss'

const sidebarMenus = [
  {
    path: '/timeline',
    label: '时光',
    icon: FieldTimeOutlined
  },
  {
    path: '/list',
    label: '日记',
    icon: ReadOutlined
  }
] as const

const sidebarFooterRoutes = [
  {
    path: '/settings',
    label: '设置',
    icon: SettingOutlined
  }
] as const

function AppSidebar() {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [isCreatingDiary, setIsCreatingDiary] = useState(false)
  const [isExportingBackup, setIsExportingBackup] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)

  const handleCreateDiary = async () => {
    /*
     * 新日记按钮直接落库，然后进入独立编辑页。
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

  const handleOpenAbout = () => {
    /*
     * 关于入口放在侧边栏内部，状态也跟着侧边栏聚合。
     */
    setIsAboutOpen(true)
  }

  const handleExportBackup = () => {
    /*
     * 备份导出放在全局侧边栏，方便用户从任意页面发起。
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

  return (
    <>
      <aside className={styles.sideBar}>
        <div className={styles.logoGroup}>
          {/* 使用独立 logo 资源，避免品牌字样在组件里重复维护。 */}
          <img className={styles.logoImage} src={logoUrl} alt="爱可日记" />
          <div className={`${styles.subtitle} text-black-65`}>Echo·Book</div>
        </div>

        {/*
         * 主导航只表达页面入口，选中态交给 NavLink 根据路由自动计算。
         */}
        <nav className={styles.sideMenu} aria-label="主导航">
          {sidebarMenus.map(menu => {
            const Icon = menu.icon

            return (
              <SidebarNavLink key={menu.path} to={menu.path}>
                <Icon className="text-size-16 mr-12" />
                {menu.label}
              </SidebarNavLink>
            )
          })}
        </nav>

        <div className="ml-24 mr-24">
          <Divider className="mt-12! mb-32!" />
          <Button
            className="pr-26! mb-24"
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

          <Button
            className="pr-24!"
            shape="round"
            block
            color="primary"
            variant="outlined"
            size="large"
            icon={<ExportOutlined className="text-size-14!" />}
            loading={isExportingBackup}
            onClick={handleExportBackup}
          >
            <span>导出</span>
          </Button>
        </div>

        <div className="mt-auto pb-12">
          <nav className={styles.sideMenu} aria-label="辅助导航">
            {sidebarFooterRoutes.map(menu => {
              const Icon = menu.icon

              return (
                <SidebarNavLink key={menu.path} to={menu.path}>
                  <Icon className="text-size-14 mr-12" />
                  <span className="text-size-14">{menu.label}</span>
                </SidebarNavLink>
              )
            })}

            <SidebarAction label="关于爱可日记" onClick={handleOpenAbout}>
              <QuestionCircleOutlined className="text-size-14 mr-12" />
            </SidebarAction>
          </nav>
        </div>
      </aside>

      <AboutDialog open={isAboutOpen} onOpenChange={setIsAboutOpen} />
    </>
  )
}

function SidebarNavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? `${styles.sideMenuItem} ${styles.sideMenuItemActive}` : styles.sideMenuItem)}>
      {children}
    </NavLink>
  )
}

function SidebarAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <div
      className={`${styles.sideMenuItem} cursor-pointer`}
      onClick={onClick}
      onKeyDown={event => {
        /*
         * action 菜单也支持键盘触发，保证基础可访问性。
         */
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
    >
      {children}
      <span className="text-size-14">{label}</span>
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

export default AppSidebar
