import { BgColorsOutlined, CheckOutlined, CopyOutlined, FolderOpenOutlined, FolderAddOutlined, UndoOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Card, Form, Input, Space } from 'antd'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { StorageInfo } from '../../../shared/settings'
import PageHeader from '../../components/PageHeader'
import { useEchoTheme } from '../../contexts/EchoThemeContext'
import { ECHO_THEME_LAYOUT_BG, ECHO_THEMES } from '../../utils/theme'
import type { EchoThemeId } from '../../utils/theme'
import styles from './SettingsPage.module.css'

function SettingsPage() {
  /*
   * 使用 App 上下文里的反馈 API，让弹窗继承当前 ConfigProvider 主题。
   */
  const { message, modal } = AntdApp.useApp()
  const { themeId, setThemeId } = useEchoTheme()
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [isLoadingStorageInfo, setIsLoadingStorageInfo] = useState(true)
  const [isOpeningStorageRoot, setIsOpeningStorageRoot] = useState(false)
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false)
  const [isMigratingNotes, setIsMigratingNotes] = useState(false)

  useEffect(() => {
    let cancelled = false

    /*
     * 设置页进入时读取 Electron main process 计算出的真实路径。
     * Web 调试环境没有 preload API，所以这里给出明确提示。
     */
    if (!window.settingsAPI) {
      setStorageInfo(null)
      setSettingsError('请通过 Electron 启动应用后查看存放路径')
      setIsLoadingStorageInfo(false)
      return () => {
        cancelled = true
      }
    }

    setIsLoadingStorageInfo(true)
    window.settingsAPI
      .getStorageInfo()
      .then(info => {
        if (cancelled) {
          return
        }

        setStorageInfo(info)
        setSettingsError('')
      })
      .catch(() => {
        if (!cancelled) {
          setStorageInfo(null)
          setSettingsError('读取存放路径失败')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingStorageInfo(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleOpenNotesDirectory = () => {
    /*
     * 打开目录只调用受控业务 API，不从 renderer 传任意路径。
     */
    if (!window.settingsAPI) {
      setSettingsError('请通过 Electron 启动应用后打开日记目录')
      return
    }

    setIsOpeningStorageRoot(true)
    window.settingsAPI
      .openNotesDirectory()
      .then(() => {
        setSettingsError('')
      })
      .catch(() => {
        setSettingsError('打开日记目录失败')
      })
      .finally(() => {
        setIsOpeningStorageRoot(false)
      })
  }

  const handleSelectDirectory = async () => {
    if (!window.settingsAPI) {
      message.error('请通过 Electron 启动应用后选择目录')
      return
    }

    setIsSelectingDirectory(true)
    try {
      const selectResult = await window.settingsAPI.selectDirectory()
      if (selectResult.canceled || !selectResult.directoryPath) {
        return
      }

      const newDirectory = selectResult.directoryPath

      /*
       * 确认迁移：将旧目录下的笔记文件搬到新目录。
       */
      modal.confirm({
        title: '修改日记存放目录',
        content: (
          <div>
            <p>你选择的新目录：</p>
            <p>
              <code style={{ wordBreak: 'break-all' }}>{newDirectory}</code>
            </p>
            <p style={{ marginTop: 12, color: 'var(--color-text-secondary)' }}>已有笔记文件将迁移到新目录，数据库文件不受影响。</p>
          </div>
        ),
        okText: '确认迁移',
        cancelText: '取消',
        onOk: async () => {
          setIsMigratingNotes(true)
          try {
            const migrateResult = await window.settingsAPI.migrateNotes(newDirectory)
            if (!migrateResult.success) {
              message.error(migrateResult.error ?? '迁移失败')
              return
            }

            /*
             * 迁移成功后重新读取存储信息。
             */
            const info = await window.settingsAPI.getStorageInfo()
            setStorageInfo(info)
            setSettingsError('')

            if (migrateResult.movedCount > 0) {
              message.success(`已迁移 ${migrateResult.movedCount} 篇日记到新目录`)
            } else {
              message.success('日记存放目录已更新')
            }
          } catch (error) {
            message.error('迁移过程出错')
          } finally {
            setIsMigratingNotes(false)
          }
        },
        onCancel() {
          /*
           * 取消时不清除选择，用户可以再次点击确认。
           */
        }
      })
    } catch {
      message.error('选择目录失败')
    } finally {
      setIsSelectingDirectory(false)
    }
  }

  const handleResetDirectory = () => {
    if (!window.settingsAPI) {
      return
    }

    modal.confirm({
      title: '恢复默认目录',
      content: '日记文件将恢复到默认的应用数据目录下。已有笔记将从当前自定义目录迁移回默认位置。',
      okText: '确认恢复',
      cancelText: '取消',
      onOk: async () => {
        setIsMigratingNotes(true)
        try {
          /*
           * 先获取默认路径，然后迁移到默认路径。
           * 重置时先读取 storageInfo 获得默认路径。
           */
          const info = await window.settingsAPI.getStorageInfo()
          if (!info) {
            message.error('无法读取存储信息')
            return
          }

          /*
           * 默认 notes 路径需要从主进程获取（不经过自定义）。
           * 这里通过先 reset 拿到默认路径，然后在 connection 层获取。
           */
          const migrateResult = await window.settingsAPI.migrateNotes('__RESET_TO_DEFAULT__')
          if (!migrateResult.success) {
            message.error(migrateResult.error ?? '恢复默认目录失败')
            return
          }

          const updatedInfo = await window.settingsAPI.getStorageInfo()
          setStorageInfo(updatedInfo)
          setSettingsError('')

          if (migrateResult.movedCount > 0) {
            message.success(`已迁移 ${migrateResult.movedCount} 篇日记到默认目录`)
          } else {
            message.success('已恢复默认目录')
          }
        } catch {
          message.error('恢复默认目录失败')
        } finally {
          setIsMigratingNotes(false)
        }
      }
    })
  }

  const handleCopyPath = (path: string | undefined, label: string) => {
    /*
     * 复制按钮只处理已读取到的真实路径，避免把加载文案写进剪贴板。
     */
    if (!path) {
      return
    }

    navigator.clipboard
      .writeText(path)
      .then(() => {
        message.success(`${label}已复制`)
      })
      .catch(() => {
        message.error('复制失败')
      })
  }

  const handleThemeChange = (nextThemeId: EchoThemeId) => {
    /*
     * 设置页只负责选择主题，真正的全局 CSS 变量同步在 App Provider 中完成。
     */
    setThemeId(nextThemeId)
    message.success('主题已更新')
  }

  return (
    <section className="flex h-full flex-col bg-page">
      <PageHeader eyebrow="Settings" title="设置" />

      <div className="min-h-0 flex-1 overflow-auto px-48 pb-56 pt-26">
        <div className="mx-auto grid max-w-960 grid-cols-1 gap-16">
          <Card
            className="rounded-[8px]!"
            title={
              <Space size={8}>
                <BgColorsOutlined />
                外观主题
              </Space>
            }
          >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-12">
              {ECHO_THEMES.map(theme => {
                const isActive = theme.id === themeId

                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={[
                      'flex min-h-74 w-full cursor-pointer items-center gap-12 rounded-[8px] border border-[var(--echo-border-color)] bg-white p-12 text-left text-color-base transition-[border-color,box-shadow,transform] duration-[160ms] ease-in-out hover:-translate-y-1 hover:border-primary',
                      isActive ? 'border-primary' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={isActive}
                    onClick={() => handleThemeChange(theme.id)}
                  >
                    <span
                      className={styles.themePreview}
                      style={
                        {
                          '--theme-primary': theme.colorPrimary,
                          '--theme-page': theme.colorPrimaryBg ?? ECHO_THEME_LAYOUT_BG
                        } as CSSProperties
                      }
                    ></span>
                    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                      <span className="col-start-1 text-size-15 font-semibold">{theme.name}</span>
                      <span className="col-start-1 text-size-13 text-color-base-65">{theme.descriptions}</span>
                      {isActive ? <CheckOutlined className="col-start-2 row-span-2 row-start-1 text-primary" /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card
            className="rounded-[8px]!"
            title={
              <Space size={8}>
                <FolderOpenOutlined />
                日记存储位置
              </Space>
            }
          >
            {settingsError ? <Alert className="mb-16" message={settingsError} type="error" showIcon /> : null}
            <Form layout="vertical">
              {/*
               * Input 保持 readOnly，便于用户选中复制路径。
               */}
              <Form.Item label="日记文件目录">
                <Space.Compact style={{ width: '100%' }}>
                  <Input readOnly value={storageInfo?.notesPath ?? (isLoadingStorageInfo ? '读取中...' : '')} />

                  <Button
                    icon={<CopyOutlined />}
                    disabled={!storageInfo?.notesPath}
                    onClick={() => handleCopyPath(storageInfo?.notesPath, '日记文件目录')}
                  >
                    复制
                  </Button>
                  <Button
                    icon={<FolderOpenOutlined />}
                    loading={isOpeningStorageRoot}
                    disabled={!storageInfo || Boolean(settingsError)}
                    onClick={handleOpenNotesDirectory}
                  >
                    打开目录
                  </Button>
                </Space.Compact>
              </Form.Item>
              <Form.Item>
                <Button
                  className="mr-16"
                  color="primary"
                  variant="outlined"
                  icon={<UndoOutlined />}
                  loading={isMigratingNotes}
                  onClick={handleResetDirectory}
                >
                  恢复默认目录
                </Button>

                <Button
                  icon={<FolderAddOutlined />}
                  color="primary"
                  variant="outlined"
                  loading={isSelectingDirectory || isMigratingNotes}
                  disabled={!window.settingsAPI || Boolean(settingsError)}
                  onClick={handleSelectDirectory}
                >
                  修改目录
                </Button>
              </Form.Item>
              {/* <Form.Item label="数据库文件">
                <Space.Compact style={{ width: '100%' }}>
                  <Input readOnly value={storageInfo?.databasePath ?? (isLoadingStorageInfo ? '读取中...' : '')} />
                  <Button
                    icon={<CopyOutlined />}
                    disabled={!storageInfo?.databasePath}
                    onClick={() => handleCopyPath(storageInfo?.databasePath, '数据库文件')}
                  >
                    复制
                  </Button>
                </Space.Compact>
              </Form.Item> */}
            </Form>
          </Card>
        </div>
      </div>
    </section>
  )
}

export default SettingsPage
