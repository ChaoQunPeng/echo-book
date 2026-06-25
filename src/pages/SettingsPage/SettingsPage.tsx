import {
  BgColorsOutlined,
  CheckOutlined,
  CopyOutlined,
  DatabaseOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  FolderAddOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Card, Form, Input, Modal, Space } from 'antd'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { StorageInfo } from '../../../shared/settings'
import PageHeader from '../../components/PageHeader'
import { useEchoTheme } from '../../contexts/EchoThemeContext'
import { ECHO_THEMES } from '../../utils/theme'
import type { EchoThemeId } from '../../utils/theme'
import styles from './SettingsPage.module.scss'

function SettingsPage() {
  const { message } = AntdApp.useApp()
  const { themeId, setThemeId } = useEchoTheme()
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [isLoadingStorageInfo, setIsLoadingStorageInfo] = useState(true)
  const [isOpeningStorageRoot, setIsOpeningStorageRoot] = useState(false)
  const [isExportingBackup, setIsExportingBackup] = useState(false)
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

  const handleExportBackup = () => {
    /*
     * 导出保存位置由 main process 打开系统保存对话框选择。
     */
    if (isExportingBackup) {
      return
    }

    if (!window.settingsAPI) {
      message.error('请通过 Electron 启动应用后导出备份')
      return
    }

    setIsExportingBackup(true)
    window.settingsAPI
      .exportBackup()
      .then(result => {
        if (!result.canceled) {
          message.success('导出完成')
        }
      })
      .catch(() => {
        message.error('导出备份失败')
      })
      .finally(() => {
        setIsExportingBackup(false)
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
      Modal.confirm({
        title: '修改日记存放目录',
        content: (
          <div>
            <p>你选择的新目录：</p>
            <p><code style={{ wordBreak: 'break-all' }}>{newDirectory}</code></p>
            <p style={{ marginTop: 12, color: 'var(--color-text-secondary)' }}>
              已有笔记文件将迁移到新目录，数据库文件不受影响。
            </p>
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
        },
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

    Modal.confirm({
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
      },
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

  const isCustomNotesPath = storageInfo?.customNotesPath != null

  return (
    <section className={styles.settingsPage}>
      <PageHeader eyebrow="Settings" title="设置" />

      <div className={styles.settingsScrollArea}>
        <div className={styles.settingsContent}>
          <Card
            title={
              <Space size={8}>
                <BgColorsOutlined />
                外观主题
              </Space>
            }
          >
            <div className={styles.themeGrid}>
              {ECHO_THEMES.map(theme => {
                const isActive = theme.id === themeId

                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={isActive ? `${styles.themeOption} ${styles.themeOptionActive}` : styles.themeOption}
                    aria-pressed={isActive}
                    onClick={() => handleThemeChange(theme.id)}
                  >
                    <span className={styles.themePreview} style={{ '--theme-primary': theme.colors.primary, '--theme-page': theme.colors.page } as CSSProperties}>
                      {isActive ? <CheckOutlined /> : null}
                    </span>
                    <span className={styles.themeText}>
                      <span className={styles.themeName}>{theme.label}</span>
                      <span className={styles.themeDescription}>{theme.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card
            title={
              <Space size={8}>
                <FolderOpenOutlined />
                存储位置
              </Space>
            }
            extra={
              <Space>
                <Button
                  icon={<FolderAddOutlined />}
                  loading={isSelectingDirectory || isMigratingNotes}
                  disabled={!window.settingsAPI || Boolean(settingsError)}
                  onClick={handleSelectDirectory}
                >
                  选择目录
                </Button>
                <Button
                  type="primary"
                  icon={<FolderOpenOutlined />}
                  loading={isOpeningStorageRoot}
                  disabled={!storageInfo || Boolean(settingsError)}
                  onClick={handleOpenNotesDirectory}
                >
                  打开日记目录
                </Button>
              </Space>
            }
          >
            {settingsError ? <Alert className={styles.settingsAlert} message={settingsError} type="error" showIcon /> : null}
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
                </Space.Compact>
              </Form.Item>
              {isCustomNotesPath && (
                <Form.Item>
                  <Button
                    icon={<UndoOutlined />}
                    loading={isMigratingNotes}
                    onClick={handleResetDirectory}
                    size="small"
                  >
                    恢复默认目录
                  </Button>
                </Form.Item>
              )}
              <Form.Item label="数据库文件">
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
              </Form.Item>
            </Form>
          </Card>

          <Card
            title={
              <Space size={8}>
                <DatabaseOutlined />
                数据管理
              </Space>
            }
          >
            <Button type="primary" icon={<ExportOutlined />} loading={isExportingBackup} onClick={handleExportBackup}>
              导出备份
            </Button>
          </Card>
        </div>
      </div>
    </section>
  )
}

export default SettingsPage