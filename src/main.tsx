import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App'
import DiaryListPage from './pages/DiaryListPage'
import EditorPage from './pages/EditorPage'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      {/*
       * 顶层路由使用 App 作为固定布局容器，App 内部的 <Outlet />
       * 会接收这里声明的所有子路由页面。后续新增页面时，只需要继续
       * 在这个 <Route path="/" element={<App />}> 下添加子路由即可。
       */}
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/list" replace />} />
          {/*
           * `/today` 是之前临时验证路由出口时使用过的旧路径。
           * 如果浏览器、Tauri WebView 或开发服务器热更新后仍停留在这个地址，
           * React Router 会因为找不到匹配路由而不渲染页面；这里将旧地址
           * 平滑重定向到当前默认的日记列表页，避免出现空白页面。
          */}
          <Route path="list" element={<DiaryListPage />} />
          <Route path="editor" element={<EditorPage />} />
          <Route path="editor/:diaryId" element={<EditorPage />} />
          {/*
           * 兜底路由用于处理输入错误或历史遗留的未知路径。
           * 统一回到默认列表页，可以保证 App 布局和主内容区始终有内容展示。
           */}
          <Route path="*" element={<Navigate to="/list" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
