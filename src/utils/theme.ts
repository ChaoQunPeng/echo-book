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
}

/*
 * 主题 id 仍由运行时主题列表校验；类型层保持 string，方便未来从配置或插件扩展主题。
 */
export type EchoThemeId = string

const THEME_STORAGE_KEY = 'echo-book-theme'

export const DEFAULT_ECHO_THEME_ID: string = 'dust-red'

export const ECHO_THEME_LAYOUT_BG = '#fafafa'

const COLOR_TEXT_BASE = '#1f1f1f'

export const ECHO_THEMES: EchoTheme[] = [
  {
    id: 'dust-red',
    // 原名：薄暮
    name: '薄暮',
    descriptions: '沉静、热烈',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#cf1322',
    colorInfo: '#cf1322'
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
  //   // 原名：青柠
  //   name: '青柠',
  //   descriptions: '清新、生机',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#7cb305',
  //   colorInfo: '#7cb305'
  // },
  // {
  //   id: 'volcano',
  //   // 原名：火山
  //   name: '赤焰',
  //   descriptions: '澎湃、勇敢',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#d4380d',
  //   colorInfo: '#d4380d'
  // },
  {
    id: 'polar-green',
    // 原名：极光绿
    name: '森林',
    descriptions: '自然、宁静',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#389e0d',
    colorInfo: '#389e0d'
  },
  {
    id: 'sunset-orange',
    // 原名：日暮
    name: '日暮',
    descriptions: '温暖、治愈',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#d46b08',
    colorInfo: '#d46b08'
  },
  // {
  //   id: 'cyan',
  //   // 原名：明青
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
    colorInfo: '#0958d9'
  },

  {
    id: 'purple',
    // 原名：酱紫
    name: '酱紫',
    descriptions: '优雅、浪漫',
    colorTextBase: COLOR_TEXT_BASE,
    colorPrimary: '#531dab',
    colorInfo: '#531dab'
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
    colorPrimaryBgHover: '#dfdfdf'
  }
  // {
  //   id: 'calendula-gold',
  //   // 原名：金盏花
  //   name: '金穗',
  //   descriptions: '明亮、活力',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#d48806',
  //   colorInfo: '#d48806'
  // },
  // {
  //   id: 'sunrise-yellow',
  //   // 原名：日出
  //   name: '日出',
  //   descriptions: '阳光、希望',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#d4b106',
  //   colorInfo: '#d4b106'
  // },
  // {
  //   id: 'geek-blue',
  //   // 原名：极客蓝
  //   name: '极客蓝',
  //   descriptions: '专注、探索',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#1d39c4',
  //   colorInfo: '#1d39c4'
  // },
  // {
  //   id: 'magenta',
  //   // 原名：法式洋红
  //   name: '洋红',
  //   descriptions: '灵动、感性',
  //   colorTextBase: COLOR_TEXT_BASE,
  //   colorPrimary: '#c41d7f',
  //   colorInfo: '#c41d7f'
  // },
];

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
