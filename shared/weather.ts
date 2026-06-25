export const WEATHERS = [
  {
    name: '晴',
    emoji: '☀️'
  },
  {
    name: '阴天',
    emoji: '☁️'
  },
  {
    name: '多云',
    emoji: '⛅'
  },
  {
    name: '雨',
    emoji: '🌧️'
  },
  {
    name: '雪',
    emoji: '❄️'
  }
] as const

/*
 * 天气只保存名称，展示层再补 emoji。
 * 历史记录里如果出现自定义值，仍然保持原文。
 */
export function formatWeather(weather: string) {
  const matchedWeather = WEATHERS.find(weatherOption => weatherOption.name === weather)

  return matchedWeather
}
