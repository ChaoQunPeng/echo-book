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
   * 默认标题固定为“这一天”，让新建日记先聚焦当天记录本身。
   */
  return DEFAULT_DIARY_TITLE_PREFIX
}
