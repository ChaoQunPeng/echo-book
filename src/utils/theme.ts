export type EchoTheme = {
  id: string
  name: string
  descriptions: string
  colorTextBase: string
  colorPrimary: string
  colorInfo: string
  /*
   * 少数主题需要覆盖 antd 派生出的主色浅背景，普通色板保持默认算法即可。
   */
  colorPrimaryBg?: string
  colorPrimaryBgHover?: string
}

/*
 * 主题 id 仍由运行时主题列表校验；类型层保持 string，方便未来从配置或插件扩展主题。
 */
export type EchoThemeId = string

const THEME_STORAGE_KEY = 'echo-book-theme'

export const DEFAULT_ECHO_THEME_ID: string = 'dust-red'

export const ECHO_THEME_LAYOUT_BG = '#f5f5f5'

const COLOR_TEXT_BASE = '#1f1f1f'

export const ECHO_THEMES: EchoTheme[] = [
  {
    id: 'dust-red',
    name: '薄暮',
    descriptions: '斗志、奔放',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#cf1322',
    colorInfo: '#cf1322'
  },
  {
    id: 'volcano',
    name: '火山',
    descriptions: '醒目、澎湃',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#d4380d',
    colorInfo: '#d4380d'
  },
  {
    id: 'sunset-orange',
    name: '日暮',
    descriptions: '温暖、欢快',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#d46b08',
    colorInfo: '#d46b08'
  },
  {
    id: 'lime',
    name: '青柠',
    descriptions: '自然、生机',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#7cb305',
    colorInfo: '#7cb305'
  },
  {
    id: 'calendula-gold',
    name: '金盏花',
    descriptions: '活力、积极',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#d48806',
    colorInfo: '#d48806'
  },
  {
    id: 'sunrise-yellow',
    name: '日出',
    descriptions: '出生、阳光',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#d4b106',
    colorInfo: '#d4b106'
  },
  {
    id: 'polar-green',
    name: '极光绿',
    descriptions: '健康、创新',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#389e0d',
    colorInfo: '#389e0d'
  },
  {
    id: 'cyan',
    name: '明青',
    descriptions: '希望、坚强',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#08979c',
    colorInfo: '#08979c'
  },
  {
    id: 'daybreak-blue',
    name: '拂晓蓝',
    descriptions: '包容、科技、普惠',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#0958d9',
    colorInfo: '#0958d9'
  },
  {
    id: 'geek-blue',
    name: '极客蓝',
    descriptions: '探索、钻研',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#1d39c4',
    colorInfo: '#1d39c4'
  },
  {
    id: 'purple',
    name: '酱紫',
    descriptions: '优雅、浪漫',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#531dab',
    colorInfo: '#531dab'
  },
  {
    id: 'magenta',
    name: '法式洋红',
    descriptions: '明快、感性',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#c41d7f',
    colorInfo: '#c41d7f'
  },
  {
    id: 'monochrome',
    name: '黑白',
    descriptions: '克制、清晰',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#1f1f1f',
    colorInfo: '#1f1f1f',
    colorPrimaryBg: '#dfdfdf',
    colorPrimaryBgHover: '#dfdfdf'
  },
]

function hexToRgbString(hex: string): string {
  /*
   * 全局 CSS 变量需要 rgb 分量来拼透明度，这里从 Ant Design token 色值统一派生。
   */
  const normalizedHex = hex.replace('#', '')
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16)
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16)
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16)

  return `${red} ${green} ${blue}`
}

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
  root.style.setProperty('--echo-color-primary', theme.colorPrimary)
  root.style.setProperty('--echo-color-page', ECHO_THEME_LAYOUT_BG)
  root.style.setProperty('--echo-color-text', theme.colorTextBase)
  root.style.setProperty('--echo-color-text-black-45', `rgb(${hexToRgbString(theme.colorTextBase)} / 45%)`)
  root.style.setProperty('--echo-color-text-black-65', `rgb(${hexToRgbString(theme.colorTextBase)} / 65%)`)
  root.style.setProperty('--echo-color-text-black-85', `rgb(${hexToRgbString(theme.colorTextBase)} / 85%)`)
  root.style.setProperty('--echo-border-color', `color-mix(in srgb, ${theme.colorPrimary} 12%, transparent)`)

  return theme
}
