import type { ReactNode } from 'react'

type PageHeaderProps = {
  eyebrow: string
  title: string
  extra?: ReactNode
  className?: string
}

/*
 * PageHeader 统一页面顶部的英文眉题、主标题和右侧状态位。
 */
function PageHeader({ eyebrow, title, extra, className }: PageHeaderProps) {
  const headerClassName = [
    'flex flex-[0_0_auto] items-end justify-between gap-20 border-b border-[rgba(15,82,56,0.08)] px-48 pb-18 pt-30',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={headerClassName}>
      <div>
        <p className="mb-4 text-size-12 font-bold uppercase tracking-normal text-primary">{eyebrow}</p>
        <h1 className="text-size-28 leading-[1.2] text-color-base">{title}</h1>
      </div>
      {extra ? <span className="text-size-13 text-[rgba(25,28,29,0.52)]">{extra}</span> : null}
    </div>
  )
}

export default PageHeader
