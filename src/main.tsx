import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App'
import { LaunchGate, LaunchRedirect, WelcomePage } from './pages/LaunchPages'

// 打包后的 Electron 使用 file:// 加载页面，HashRouter 可以避免刷新或跳转时丢失 index.html。
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

/*
 * 首次欢迎页保持同步加载，主应用相关页面延后到真正进入时再下载和解析。
 * 这样首次安装后的欢迎页不会被编辑器、列表和时间轴等较重模块拖慢。
 */
const AppShellLayout = lazy(() => import('./layouts/AppShellLayout'))
const DiaryListPage = lazy(() => import('./pages/DiaryList'))
const DiaryPreviewPage = lazy(() => import('./pages/DiaryPreviewPage'))
const EditorPage = lazy(() => import('./pages/EditorPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const TimelinePage = lazy(() => import('./pages/TimelinePage'))

function RouteSuspenseFallback() {
  /*
   * 动态路由 chunk 加载时保持主应用背景，避免页面短暂白屏。
   */
  return <div className="grid min-h-screen place-items-center bg-page text-color-base-65">正在打开...</div>
}

function withRouteSuspense(element: React.ReactElement) {
  /*
   * 子页面单独挂 Suspense，页面 chunk 加载时保留已经出现的应用外壳。
   */
  return <Suspense fallback={<RouteSuspenseFallback />}>{element}</Suspense>
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Router>
      {/*
       * 顶层 App 只负责全局 Provider 和路由出口。
       * 带侧边栏的页面统一挂在 AppShellLayout 下面。
       */}
      <Routes>
        <Route path="/" element={<App />}>
          {/* 欢迎页和主应用外壳平级，避免首次引导带上侧边栏。 */}
          <Route index element={<LaunchRedirect />} />
          <Route path="welcome" element={<WelcomePage />} />

          <Route element={<LaunchGate />}>
            <Route
              element={
                <Suspense fallback={<RouteSuspenseFallback />}>
                  <AppShellLayout />
                </Suspense>
              }
            >
              {/*
               * `/today` 是之前临时验证路由出口时使用过的旧路径。
               * 保留重定向可以避免历史地址打开后出现空白页面。
               */}
              <Route path="today" element={<Navigate to="/list" replace />} />
              <Route path="list" element={withRouteSuspense(<DiaryListPage />)} />
              {/* 日记列表的选中项交给路由参数维护，刷新和前进后退都能保留当前日记。 */}
              <Route path="list/:diaryId" element={withRouteSuspense(<DiaryListPage />)} />
              {/* 时光页只负责浏览和回顾历史记录，打开日记时进入内容页。 */}
              <Route path="timeline" element={withRouteSuspense(<TimelinePage />)} />
              {/*
               * 设置页独立成路由，便于后续继续加入更多设置分组。
               */}
              <Route path="settings" element={withRouteSuspense(<SettingsPage />)} />
              {/*
               * 编辑页只接收已创建日记的 id。
               * 新建入口会先创建日记，再使用返回的 id 进入这里。
               */}
              <Route path="editor/:diaryId" element={withRouteSuspense(<EditorPage />)} />
              {/* 内容页复用 DiaryPreviewPage，按 id 展示单篇日记。 */}
              <Route path="preview/:diaryId" element={withRouteSuspense(<DiaryPreviewPage />)} />
              {/*
               * 兜底路由用于处理输入错误或历史遗留的未知路径。
               */}
              <Route path="*" element={<Navigate to="/list" replace />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Router>
  </React.StrictMode>
)
