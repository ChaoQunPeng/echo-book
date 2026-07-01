export const MOODS = [
  {
    name: '平静'
  },
  {
    name: '开心'
  },
  {
    name: '疲惫'
  },
  {
    name: '无语'
  },
  {
    name: '低落'
  },
  {
    name: '大哭'
  }
] as const

/*
 * 新建日记默认选中第一个心情，避免各入口重复硬编码“平静”。
 */
export const DEFAULT_MOOD = MOODS[0].name

export function formatMood(mood: string) {
  /*
   * 数据库存储心情名称；历史自定义心情找不到时由调用方保持原文。
   */
  const matchedMood = MOODS.find(moodOption => moodOption.name === mood)

  return matchedMood
}
