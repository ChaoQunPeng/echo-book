import { NavLink, Outlet } from 'react-router-dom'
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
      </aside>
      <div className="main-container">
        <Outlet />
      </div>
    </div>
  )
}

export default App
