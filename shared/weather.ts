export const WEATHERS = [
  {
    name: '晴'
  },
  {
    name: '阴天'
  },
  {
    name: '多云'
  },
  {
    name: '雨'
  },
  {
    name: '雪'
  }
] as const

/*
 * 天气只保存名称。
 * 历史记录里如果出现自定义值，仍然保持原文。
 */
export function formatWeather(weather: string) {
  const matchedWeather = WEATHERS.find(weatherOption => weatherOption.name === weather)

  return matchedWeather
}
