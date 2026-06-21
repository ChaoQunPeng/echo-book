export type EchoTheme = {
  id: string
  label: string
  description: string
  colors: {
    primary: string
    page: string
    text: string
    textRgb: string
  }
}

/*
 * 主题 id 仍由运行时主题列表校验；类型层保持 string，方便未来从配置或插件扩展主题。
 */
export type EchoThemeId = string

const THEME_STORAGE_KEY = 'echo-book-theme'

export const DEFAULT_ECHO_THEME_ID: string = 'forest'

export const ECHO_THEMES: EchoTheme[] = [
  {
    id: 'forest',
    label: '森林绿',
    description: '安静、专注',
    colors: {
      primary: '#237804',
      page: '#f8f9fa',
      text: '#191c1d',
      textRgb: '25 28 29'
    }
  },
  {
    id: 'lake',
    label: '湖蓝',
    description: '清爽、明亮',
    colors: {
      primary: '#096dd9',
      page: '#f7fbff',
      text: '#182233',
      textRgb: '24 34 51'
    }
  },
  {
    id: 'rose',
    label: '蔷薇',
    description: '柔和、温暖',
    colors: {
      primary: '#c41d7f',
      page: '#fff8fb',
      text: '#2b1f27',
      textRgb: '43 31 39'
    }
  },
  {
    id: 'amber',
    label: '琥珀',
    description: '松弛、复古',
    colors: {
      primary: '#ad6800',
      page: '#fffaf0',
      text: '#2d2618',
      textRgb: '45 38 24'
    }
  },
  {
    id: 'light',
    label: '纯白',
    description: '极简、清晰',
    colors: {
      primary: '#111111',
      page: '#ffffff',
      text: '#191c1d',
      textRgb: '25 28 29'
    }
  },
  {
    id: 'orange',
    label: '暖橙',
    description: '活力、温暖',
    colors: {
      primary: '#d46b08',
      page: '#fff7e6',
      text: '#2b1d0e',
      textRgb: '43 29 14'
    }
  }
]

export function getEchoTheme(themeId: string): EchoTheme {
  /*
   * 兜底到默认主题，避免旧版本本地缓存保存了已经不存在的主题 id。
   */
  return ECHO_THEMES.find(theme => theme.id === themeId) ?? ECHO_THEMES[0]
}

export function isEchoThemeId(themeId: string | null): boolean {
  /*
   * string 放宽为 string 后，仍用主题列表做运行时有效性检查。
   */
  return ECHO_THEMES.some(theme => theme.id === themeId)
}

export function readStoredEchoThemeId(): string {
  /*
   * SSR 或测试环境可能没有 window，这时直接使用默认主题。
   */
  if (typeof window === 'undefined') {
    return DEFAULT_ECHO_THEME_ID
  }

  const storedThemeId = window.localStorage.getItem(THEME_STORAGE_KEY)
  return storedThemeId && isEchoThemeId(storedThemeId) ? storedThemeId : DEFAULT_ECHO_THEME_ID
}

export function persistEchoThemeId(themeId: string) {
  /*
   * 主题偏好只影响当前设备，使用 localStorage 足够轻量。
   */
  window.localStorage.setItem(THEME_STORAGE_KEY, themeId)
}

export function applyEchoTheme(themeId: string): EchoTheme {
  const theme = getEchoTheme(themeId)
  const root = document.documentElement

  /*
   * 全局 CSS 变量负责非 antd 区域，antd 主题由 App.tsx 同步读取同一份配置。
   */
  root.dataset.echoTheme = theme.id
  root.style.setProperty('--echo-color-primary', theme.colors.primary)
  root.style.setProperty('--echo-color-page', theme.colors.page)
  root.style.setProperty('--echo-color-text', theme.colors.text)
  root.style.setProperty('--echo-color-text-black-45', `rgb(${theme.colors.textRgb} / 45%)`)
  root.style.setProperty('--echo-color-text-black-65', `rgb(${theme.colors.textRgb} / 65%)`)
  root.style.setProperty('--echo-color-text-black-85', `rgb(${theme.colors.textRgb} / 85%)`)
  root.style.setProperty('--echo-border-color', `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`)

  return theme
}
