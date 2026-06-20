import { CopyOutlined, DatabaseOutlined, ExportOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { Alert, App as AntdApp, Button, Card, Form, Input, Space } from 'antd'
import { useEffect, useState } from 'react'
import type { StorageInfo } from '../../../shared/settings'
import PageHeader from '../../components/PageHeader'
import styles from './SettingsPage.module.scss'

function SettingsPage() {
  const { message } = AntdApp.useApp()
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [settingsError, setSettingsError] = useState('')
  const [isLoadingStorageInfo, setIsLoadingStorageInfo] = useState(true)
  const [isOpeningStorageRoot, setIsOpeningStorageRoot] = useState(false)
  const [isExportingBackup, setIsExportingBackup] = useState(false)

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

  const handleOpenStorageRoot = () => {
    /*
     * 打开目录只调用受控业务 API，不从 renderer 传任意路径。
     */
    if (!window.settingsAPI) {
      setSettingsError('请通过 Electron 启动应用后打开存储目录')
      return
    }

    setIsOpeningStorageRoot(true)
    window.settingsAPI
      .openStorageRoot()
      .then(() => {
        setSettingsError('')
      })
      .catch(() => {
        setSettingsError('打开存储目录失败')
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

  return (
    <section className={styles.settingsPage}>
      <PageHeader eyebrow="Settings" title="设置" />

      <div className={styles.settingsScrollArea}>
        <div className={styles.settingsContent}>
          <Card
            title={
              <Space size={8}>
                <FolderOpenOutlined />
                存储位置
              </Space>
            }
            extra={
              <Button
                type="primary"
                icon={<FolderOpenOutlined />}
                loading={isOpeningStorageRoot}
                disabled={!storageInfo || Boolean(settingsError)}
                onClick={handleOpenStorageRoot}
              >
                打开存储目录
              </Button>
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
