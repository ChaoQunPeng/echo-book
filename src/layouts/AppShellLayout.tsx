import { Outlet } from 'react-router-dom'
import AppSidebar from './AppSidebar'

function AppShellLayout() {
  /*
   * AppShellLayout 承载带侧边栏的应用外壳。
   * 右侧主区域继续通过 Outlet 渲染当前页面。
   */
  return (
    <div className="flex h-screen bg-page text-color-base">
      <AppSidebar />

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}

export default AppShellLayout
