import type { ButtonHTMLAttributes, ReactNode } from 'react'

/*
 * EchoButton 目前只提供两个基础样式：
 * solid 表示纯色按钮，outline 表示线性按钮。
 * 使用联合类型可以让调用方只传入受支持的变体，避免拼错字符串导致样式失效。
 */
type EchoButtonVariant = 'solid' | 'outline'

type EchoButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /*
   * variant 控制按钮视觉，不控制业务含义。
   * 默认使用 solid，让最常见的主按钮写法保持最短。
   */
  variant?: EchoButtonVariant
  /*
   * icon 是预留的图标插槽。
   * 现在不强制使用图标，但保留这个入口可以让按钮后续放进工具栏时不用改组件结构。
   */
  icon?: ReactNode
}

function EchoButton({
  variant = 'solid',
  icon,
  className,
  children,
  type = 'button',
  ...buttonProps
}: EchoButtonProps) {
  /*
   * 组件自己的类名负责基础样式和变体样式。
   * 外部传入的 className 只做补充，适合添加 margin、宽度等局部布局样式。
   */
  const buttonClassName = ['echo-button', `echo-button--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={buttonClassName} type={type} {...buttonProps}>
      {icon}
      {children}
    </button>
  )
}

export default EchoButton
