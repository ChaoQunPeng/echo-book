import { Outlet } from 'react-router-dom'
import AppSidebar from './AppSidebar'
import styles from './AppShellLayout.module.scss'

function AppShellLayout() {
  /*
   * AppShellLayout 承载带侧边栏的应用外壳。
   * 右侧主区域继续通过 Outlet 渲染当前页面。
   */
  return (
    <div className={styles.appShell}>
      <AppSidebar />

      <div className={styles.mainContainer}>
        <Outlet />
      </div>
    </div>
  )
}

export default AppShellLayout
