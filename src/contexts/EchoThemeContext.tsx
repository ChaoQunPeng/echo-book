import { createContext, useContext } from 'react'
import type { EchoThemeId } from '../utils/theme'

type EchoThemeContextValue = {
  themeId: EchoThemeId
  setThemeId: (themeId: EchoThemeId) => void
}

export const EchoThemeContext = createContext<EchoThemeContextValue | null>(null)

export function useEchoTheme() {
  const context = useContext(EchoThemeContext)

  /*
   * 主题选择必须挂在 App Provider 下，便于开发时快速发现接入遗漏。
   */
  if (!context) {
    throw new Error('useEchoTheme must be used within EchoThemeContext.Provider')
  }

  return context
}
