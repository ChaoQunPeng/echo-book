import { Modal, Typography, theme as antdTheme } from 'antd'
import type { CSSProperties } from 'react'
import styles from './AboutDialog.module.scss'

type AboutDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const aboutPrinciples = [
  {
    title: '你的回忆只属于你',
    description: '数据仅保存在你的设备中，不上传云端',
    note: '回忆不需要托付给别人保管'
  },
  {
    title: '一个压缩包就能带走全部回忆',
    description: '所有记录可一键打包，随时迁移或备份',
    note: '想带走的时候，它们随时都能陪你一起出发'
  },
  {
    title: '记录不被锁定，也不会被限制在任何应用中',
    description: '开放结构，日记以通用 Markdown 格式保存',
    note: '多年以后，它们依然能够被轻松打开'
  }
]

function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { token } = antdTheme.useToken()

  const aboutStyle = {
    '--about-bg': token.colorBgElevated,
    '--about-text': token.colorText,
    '--about-text-secondary': token.colorTextSecondary,
    '--about-text-tertiary': token.colorTextTertiary,
    '--about-accent': token.colorPrimary
  } as CSSProperties

  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      width={640} /* 收紧宽度，让文字层级成为主要视觉区分 */
      centered
      className={styles.aboutModal}
      style={aboutStyle}
      styles={{
        body: {
          padding: 0
        }
      }}
    >
      <section className={styles.aboutDialog} aria-labelledby="about-dialog-title">
        <div className={styles.aboutInner}>
          <Typography.Text className={styles.aboutEyebrow}>About Echo Book</Typography.Text>
          <Typography.Title level={2} className="mt-4!">
            关于爱可日记
          </Typography.Title>
          <div className="mb-12">记录值得被珍藏，而不是被锁住。</div>

          {/* <div>爱可日记是一款本地优先的日记应用：</div> */}

          {/* 只用字号、字重和颜色建立层级，不额外做块状分隔。 */}
          <div className={styles.aboutPrinciples}>
            {aboutPrinciples.map(principle => (
              <div key={principle.title} className="">
                <div className={styles.principleTitle}>
                  {/* 小方块用于给原则标题增加轻量装饰。 */}
                  <span className={styles.principleMarker} aria-hidden="true" />
                  <span>{principle.title}</span>
                </div>
                <div className="text-black-65! mb-4 ml-18">{principle.description}</div>
                <div className="text-black-65! mb-4 ml-18">{principle.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Modal>
  )
}

export default AboutDialog
