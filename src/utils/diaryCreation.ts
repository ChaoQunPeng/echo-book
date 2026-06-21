import type { DiaryDetail } from '../../shared/diary'
import { DEFAULT_DIARY_TITLE_PREFIX } from '../../shared/defaultDiary'

/*
 * 创建入口统一走这里，确保按钮点击时已经生成真实日记记录。
 */
export async function createDefaultDiary(): Promise<DiaryDetail> {
  if (!window.diaryAPI) {
    throw new Error('请通过 Electron 启动应用后创建日记')
  }

  return window.diaryAPI.createDiary({
    title: buildDefaultDiaryTitle(),
    markdown: ''
  })
}

function buildDefaultDiaryTitle(): string {
  /*
   * 标题带上短时间，连续创建多篇时列表里更容易区分。
   */
  const createdAtLabel = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date())

  return `${DEFAULT_DIARY_TITLE_PREFIX} ${createdAtLabel}`
}
