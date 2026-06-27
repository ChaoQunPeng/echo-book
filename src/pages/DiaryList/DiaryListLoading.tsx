import { Skeleton } from 'antd'

function DiaryListLoading() {
  /*
   * 骨架屏贴近左右分栏结构，读取期间让页面尺寸保持稳定。
   */
  return (
    <div className="h-full min-h-360 bg-page" aria-busy="true" aria-live="polite">
      <div className="flex h-full">
        <aside className="w-320 border-r border-[rgba(15,82,56,0.12)] bg-white">
          <div className="grid grid-cols-[1fr_32px] gap-10 border-b border-[rgba(25,28,29,0.08)] p-12">
            <Skeleton.Input active block size="small" />
            <Skeleton.Button active shape="circle" size="small" />
          </div>

          <div className="flex flex-col gap-14 px-24 py-18">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="border-b border-[rgba(25,28,29,0.06)] pb-16">
                <Skeleton active title paragraph={{ rows: 2 }} />
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-white px-56 py-44">
          <Skeleton active title paragraph={{ rows: 10 }} />
        </main>
      </div>
    </div>
  )
}

export default DiaryListLoading
