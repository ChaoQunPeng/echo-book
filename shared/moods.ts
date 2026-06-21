export const MOODS = [
  {
    name: '平静',
    emoji: '🙂'
  },
  {
    name: '开心',
    emoji: '😀'
  },
  {
    name: '疲惫',
    emoji: '🫠'
  },
  {
    name: '无语',
    emoji: '😶'
  },
  {
    name: '低落',
    emoji: '😔'
  },
  {
    name: '大哭',
    emoji: '😭'
  }
] as const

/*
 * 新建日记默认选中第一个心情，避免各入口重复硬编码“平静”。
 */
export const DEFAULT_MOOD = MOODS[0].name

export function formatMood(mood: string) {
  /*
   * 数据库存储心情名称，展示层再补 emoji；历史自定义心情找不到时保持原文。
   */
  const matchedMood = MOODS.find(moodOption => moodOption.name === mood)

  return matchedMood;
}
