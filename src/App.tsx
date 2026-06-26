import { App as AntdApp, ConfigProvider } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { EchoThemeContext } from './contexts/EchoThemeContext'
import { ECHO_THEME_LAYOUT_BG, applyEchoTheme, getEchoTheme, persistEchoThemeId, readStoredEchoThemeId } from './utils/theme'

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
        /*
         * Antd 组件直接消费新版主题 token，非 antd 区域由 applyEchoTheme 同步 CSS 变量。
         */
        colorPrimary: activeTheme.colorPrimary,
        colorInfo: activeTheme.colorInfo,
        colorPrimaryBg: activeTheme.colorPrimaryBg,
        colorPrimaryBgHover: activeTheme.colorPrimaryBgHover,
        colorTextBase: activeTheme.colorTextBase,
        colorBgBase: activeTheme.colorBgBase
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
  /*
   * AppLayout 只保留顶层路由出口。
   * 真实页面外壳由下一级 layout 路由决定。
   */
  return (
    <div className="appContainer">
      <Outlet />
    </div>
  )
}

export default App
