import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App'
import AppShellLayout from './layouts/AppShellLayout'
import DiaryListPage from './pages/DiaryList'
import DiaryPreviewPage from './pages/DiaryPreviewPage'
import EditorPage from './pages/EditorPage'
import { LaunchGate, LaunchRedirect, WelcomePage } from './pages/LaunchPages'
import SettingsPage from './pages/SettingsPage'
import TimelinePage from './pages/TimelinePage'

// 打包后的 Electron 使用 file:// 加载页面，HashRouter 可以避免刷新或跳转时丢失 index.html。
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter

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
            <Route element={<AppShellLayout />}>
              {/*
               * `/today` 是之前临时验证路由出口时使用过的旧路径。
               * 保留重定向可以避免历史地址打开后出现空白页面。
               */}
              <Route path="today" element={<Navigate to="/list" replace />} />
              <Route path="list" element={<DiaryListPage />} />
              {/* 日记列表的选中项交给路由参数维护，刷新和前进后退都能保留当前日记。 */}
              <Route path="list/:diaryId" element={<DiaryListPage />} />
              {/* 时光页只负责浏览和回顾历史记录，打开日记时进入内容页。 */}
              <Route path="timeline" element={<TimelinePage />} />
              {/*
               * 设置页独立成路由，便于后续继续加入更多设置分组。
               */}
              <Route path="settings" element={<SettingsPage />} />
              {/*
               * 编辑页只接收已创建日记的 id。
               * 新建入口会先创建日记，再使用返回的 id 进入这里。
               */}
              <Route path="editor/:diaryId" element={<EditorPage />} />
              {/* 内容页复用 DiaryPreviewPage，按 id 展示单篇日记。 */}
              <Route path="preview/:diaryId" element={<DiaryPreviewPage />} />
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
