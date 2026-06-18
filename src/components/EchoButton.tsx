import { Button } from 'antd'
import type { ButtonProps } from 'antd'

/*
 * EchoButton 目前只提供两个基础样式：
 * solid 表示纯色按钮，outline 表示线性按钮。
 * 使用联合类型可以让调用方只传入受支持的变体，避免拼错字符串导致样式失效。
 */
type EchoButtonVariant = 'solid' | 'outline'

type EchoButtonProps = Omit<ButtonProps, 'type' | 'variant'> & {
  /*
   * variant 控制按钮视觉，不控制业务含义。
   * 默认使用 solid，让最常见的主按钮写法保持最短。
   */
  variant?: EchoButtonVariant
}

function EchoButton({
  variant = 'solid',
  className,
  children,
  ...buttonProps
}: EchoButtonProps) {
  /*
   * 只把项目语义 variant 映射到 antd 的按钮类型。
   * 视觉样式完全交给 antd，外部 className 只用于必要的布局扩展。
   */
  return (
    <Button
      className={className}
      type={variant === 'solid' ? 'primary' : 'default'}
      {...buttonProps}
    >
      {children}
    </Button>
  )
}

export default EchoButton
