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
  colorBgBase?: string

  gradient?: {
    from: string
    to: string
    angle?: number
  }
}

/*
 * 主题 id 仍由运行时主题列表校验；类型层保持 string，方便未来从配置或插件扩展主题。
 */
export type EchoThemeId = string

const THEME_STORAGE_KEY = 'echo-book-theme'

/*
 * 新用户首次进入时默认使用墨白主题。
 */
export const DEFAULT_ECHO_THEME_ID: string = 'polar-green'

export const ECHO_THEME_LAYOUT_BG = '#fafafa'

const COLOR_TEXT_BASE = '#1f1f1f'

export const ECHO_THEMES: EchoTheme[] = [
  {
    id: 'polar-green',
    // 原名：极光绿
    name: '森林',
    descriptions: '自然、宁静',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#389e0d',
    colorInfo: '#389e0d',
    gradient: {
      from: '#73d13d',
      to: '#389e0d',
      angle: 135
    }
  },
  {
    id: 'dust-red',
    // 原名：薄暮
    name: '薄暮',
    descriptions: '沉静、热烈',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#cf1322',
    colorInfo: '#cf1322',
    gradient: {
      from: '#ff4d4f',
      to: '#cf1322',
      angle: 135
    }
  },

  // {
  //   id: 'moonlight',
  //   name: '月夜',
  //   descriptions: '宁静、安然',
  //   colorTextBase: '#ffffff',
  //   colorBgBase: '#141414',
  //   colorPrimary: '#7c9eff',
  //   colorInfo: '#7c9eff'
  // },

  // {
  //   id: 'lime',
  //   name: '青柠',
  //   descriptions: '清新、生机',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#7cb305',
  //   colorInfo: '#7cb305'
  // },

  // {
  //   id: 'volcano',
  //   name: '赤焰',
  //   descriptions: '澎湃、勇敢',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#d4380d',
  //   colorInfo: '#d4380d'
  // },

  {
    id: 'sunset-orange',
    // 原名：日暮
    name: '日暮',
    descriptions: '温暖、治愈',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#d46b08',
    colorInfo: '#d46b08',
    gradient: {
      from: '#fa8c16',
      to: '#d46b08',
      angle: 135
    }
  },

  // {
  //   id: 'cyan',
  //   name: '青明',
  //   descriptions: '清澈、平和',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#08979c',
  //   colorInfo: '#08979c'
  // },

  {
    id: 'daybreak-blue',
    // 原名：拂晓蓝
    name: '拂晓蓝',
    descriptions: '安稳、包容',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#0958d9',
    colorInfo: '#0958d9',
    gradient: {
      from: '#4096ff',
      to: '#0958d9',
      angle: 135
    }
  },

  {
    id: 'purple',
    // 原名：酱紫
    name: '酱紫',
    descriptions: '优雅、浪漫',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#531dab',
    colorInfo: '#531dab',
    gradient: {
      from: '#9254de',
      to: '#531dab',
      angle: 135
    }
  },

  {
    id: 'monochrome',
    // 原名：黑白
    name: '墨白',
    descriptions: '克制、纯粹',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#1f1f1f',
    colorInfo: '#1f1f1f',
    colorPrimaryBg: '#dfdfdf',
    colorPrimaryBgHover: '#dfdfdf',
    gradient: {
      from: '#595959',
      to: '#1f1f1f',
      angle: 135
    }
  }

  // {
  //   id: 'calendula-gold',
  //   name: '金穗',
  //   descriptions: '明亮、活力',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#d48806',
  //   colorInfo: '#d48806'
  // },

  // {
  //   id: 'sunrise-yellow',
  //   name: '日出',
  //   descriptions: '阳光、希望',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#d4b106',
  //   colorInfo: '#d4b106'
  // },

  // {
  //   id: 'geek-blue',
  //   name: '极客蓝',
  //   descriptions: '专注、探索',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#1d39c4',
  //   colorInfo: '#1d39c4'
  // },

  // {
  //   id: 'magenta',
  //   name: '洋红',
  //   descriptions: '灵动、感性',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#c41d7f',
  //   colorInfo: '#c41d7f'
  // },
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

function buildThemeGradient(theme: EchoTheme): string {
  /*
   * 渐变变量优先使用主题配置，未配置时退回主色，方便按钮样式统一消费。
   */
  if (!theme.gradient) {
    return theme.colorPrimary
  }

  return `linear-gradient(${theme.gradient.angle ?? 135}deg, ${theme.gradient.to}, ${theme.gradient.from})`
}

export function getEchoTheme(themeId: string): EchoTheme {
  /*
   * 兜底到默认主题，避免旧版本本地缓存保存了已经不存在的主题 id。
   */
  return ECHO_THEMES.find(theme => theme.id === themeId) ?? ECHO_THEMES.find(theme => theme.id === DEFAULT_ECHO_THEME_ID) ?? ECHO_THEMES[0]
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
  const textBaseRgb = hexToRgbString(theme.colorTextBase)

  /*
   * 全局 CSS 变量负责非 antd 区域，antd 主题由 App.tsx 同步读取同一份配置。
   */
  root.dataset.echoTheme = theme.id
  root.style.setProperty('--echo-color-primary', theme.colorPrimary)
  root.style.setProperty('--echo-color-page', ECHO_THEME_LAYOUT_BG)
  root.style.setProperty('--echo-color-base', theme.colorTextBase)
  root.style.setProperty('--echo-color-base-hover', `rgb(${textBaseRgb} / 4%)`)
  root.style.setProperty('--echo-color-base-45', `rgb(${textBaseRgb} / 45%)`)
  root.style.setProperty('--echo-color-base-65', `rgb(${textBaseRgb} / 65%)`)
  root.style.setProperty('--echo-color-base-85', `rgb(${textBaseRgb} / 85%)`)
  root.style.setProperty('--echo-color-primary-soft', `color-mix(in srgb, ${theme.colorPrimary} 8%, transparent)`)
  root.style.setProperty('--echo-color-primary-surface', `color-mix(in srgb, ${theme.colorPrimary} 5%, #ffffff)`)
  root.style.setProperty('--echo-border-color', `#d9d9d9`)
  root.style.setProperty('--echo-gradient-primary', buildThemeGradient(theme))

  return theme
}
