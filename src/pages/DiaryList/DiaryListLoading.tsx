import { Skeleton } from 'antd'
import styles from './DiaryListPage.module.scss'

function DiaryListLoading() {
  /*
   * 骨架屏贴近左右分栏结构，读取期间让页面尺寸保持稳定。
   */
  return (
    <div className={styles.diaryListLoading} aria-busy="true" aria-live="polite">
      <div className={styles.diaryListLoadingLayout}>
        <aside className={styles.diaryListLoadingPanel}>
          <div className={styles.diaryListLoadingToolbar}>
            <Skeleton.Input active block size="small" />
            <Skeleton.Button active shape="circle" size="small" />
          </div>

          <div className={styles.diaryListLoadingItems}>
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className={styles.diaryListLoadingItem}>
                <Skeleton active title paragraph={{ rows: 2 }} />
              </div>
            ))}
          </div>
        </aside>

        <main className={styles.diaryListLoadingEditor}>
          <Skeleton active title paragraph={{ rows: 10 }} />
        </main>
      </div>
    </div>
  )
}

export default DiaryListLoading
