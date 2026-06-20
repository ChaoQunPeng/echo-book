import type { ReactNode } from 'react'
import styles from './PageHeader.module.scss'

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
  const headerClassName = [styles.pageHeader, className].filter(Boolean).join(' ')

  return (
    <div className={headerClassName}>
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {extra ? <span>{extra}</span> : null}
    </div>
  )
}

export default PageHeader
