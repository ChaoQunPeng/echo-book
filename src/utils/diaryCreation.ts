import type { DiaryDetail } from '../../shared/diary'
import { DEFAULT_DIARY_TITLE_PREFIX } from '../../shared/defaultDiary'

const MIN_DEFAULT_DIARY_CREATION_LOADING_MS = 500

let defaultDiaryCreationPromise: Promise<DiaryDetail> | null = null
let defaultDiaryCreationLoadingPromise: Promise<void> | null = null

/*
 * 创建入口统一走这里，确保按钮点击时已经生成真实日记记录。
 */
export async function createDefaultDiary(): Promise<DiaryDetail> {
  const diaryAPI = window.diaryAPI
  const hasDiaryAPI = diaryAPI !== undefined && diaryAPI !== null

  if (hasDiaryAPI === false) {
    throw new Error('请通过 Electron 启动应用后创建日记')
  }

  const pendingCreationPromise = defaultDiaryCreationPromise
  const hasPendingCreation = pendingCreationPromise !== null

  if (hasPendingCreation) {
    return pendingCreationPromise
  }

  const creationStartedAt = Date.now()
  const creationPromise = diaryAPI.createDiary({
    title: buildDefaultDiaryTitle(),
    markdown: ''
  })

  defaultDiaryCreationPromise = creationPromise
  defaultDiaryCreationLoadingPromise = creationPromise
    .catch(() => {
      /*
       * 创建失败也要走同一个 loading 保护窗口，避免错误瞬间闪一下后继续连点。
       */
      return undefined
    })
    .then(async () => {
      /*
       * 创建结果不等这段冷却；这里仅控制 loading 和下一次创建的放行时机。
       */
      const elapsedMilliseconds = Date.now() - creationStartedAt
      const remainingLoadingMilliseconds = MIN_DEFAULT_DIARY_CREATION_LOADING_MS - elapsedMilliseconds
      const shouldWaitForLoading = remainingLoadingMilliseconds > 0

      if (shouldWaitForLoading) {
        await wait(remainingLoadingMilliseconds)
      }
    })
    .finally(() => {
      defaultDiaryCreationPromise = null
      defaultDiaryCreationLoadingPromise = null
    })

  return creationPromise
}

export async function waitForDefaultDiaryCreationLoading(): Promise<void> {
  const loadingPromise = defaultDiaryCreationLoadingPromise
  const hasLoadingPromise = loadingPromise !== null

  if (hasLoadingPromise) {
    await loadingPromise
  }
}

function buildDefaultDiaryTitle(): string {
  /*
   * 默认标题固定为“这一天”，让新建日记先聚焦当天记录本身。
   */
  return DEFAULT_DIARY_TITLE_PREFIX
}

function wait(milliseconds: number): Promise<void> {
  /*
   * loading 兜底只需要简单计时，不参与业务数据计算。
   */
  return new Promise(resolve => {
    window.setTimeout(resolve, milliseconds)
  })
}
