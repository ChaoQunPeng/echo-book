import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, ColorPicker, Input, Modal, Popconfirm, Tooltip } from 'antd'
import { useEffect, useState } from 'react'
import type { TagLibraryItem } from '../../../shared/tags'
import styles from './TagManagerDialog.module.scss'

const DEFAULT_TAG_COLOR = '#237804'
const TAG_COLOR_OPTIONS = ['#237804', '#1677ff', '#13c2c2', '#722ed1', '#eb2f96', '#fa8c16', '#a0d911', '#8c8c8c']

type TagManagerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onTagsChanged: () => void
}

function TagManagerDialog({ open, onOpenChange, onTagsChanged }: TagManagerDialogProps) {
  const [storedTags, setStoredTags] = useState<TagLibraryItem[]>([])
  const [draftName, setDraftName] = useState('')
  const [draftColor, setDraftColor] = useState(DEFAULT_TAG_COLOR)
  const [editingTagName, setEditingTagName] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditingTag = Boolean(editingTagName)

  useEffect(() => {
    if (!open) {
      return
    }

    void loadTags()
  }, [open])

  const loadTags = async () => {
    if (!window.tagAPI) {
      setStoredTags([])
      return
    }

    try {
      setStoredTags(await window.tagAPI.getTagLibrary())
    } catch (error) {
      setFormError(`读取标签失败：${getErrorMessage(error)}`)
    }
  }

  const handleSubmitTag = async () => {
    /*
     * 管理弹框只更新标签库，不修改当前日记已选择的标签。
     */
    const normalizedName = draftName.trim()

    if (!normalizedName) {
      setFormError('请输入标签文本')
      return
    }

    setIsSubmitting(true)
    setFormError('')

    try {
      if (editingTagName) {
        await window.tagAPI.updateTag({ oldName: editingTagName, name: normalizedName, color: draftColor })
      } else {
        await window.tagAPI.createTag({ name: normalizedName, color: draftColor })
      }

      resetForm()
      await loadTags()
      onTagsChanged()
    } catch (error) {
      setFormError(`保存标签失败：${getErrorMessage(error)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditTag = (tag: TagLibraryItem) => {
    setEditingTagName(tag.name)
    setDraftName(tag.name)
    setDraftColor(tag.color)
    setFormError('')
  }

  const handleDeleteTag = async (tag: TagLibraryItem) => {
    /*
     * 删除只移除 tags 表里的标签库记录，不改历史日记里的 tags 数组。
     */
    try {
      await window.tagAPI.deleteTag(tag.name)
      await loadTags()
      onTagsChanged()

      if (editingTagName === tag.name) {
        resetForm()
      }
    } catch (error) {
      setFormError(`删除标签失败：${getErrorMessage(error)}`)
    }
  }

  const resetForm = () => {
    setDraftName('')
    setDraftColor(DEFAULT_TAG_COLOR)
    setEditingTagName(null)
    setFormError('')
  }

  return (
    <Modal
      title="管理标签"
      open={open}
      onCancel={() => onOpenChange(false)}
      footer=""
      // footer={
      //   <Button variant="outlined" onClick={() => onOpenChange(false)}>
      //     关闭
      //   </Button>
      // }
      width={640}
    >
      <div className={styles.dialogBody}>
        <div className={styles.tagListPanel}>
          <p className={styles.panelTitle}>标签库</p>
          <div className={styles.tagList}>
            {storedTags.length ? (
              storedTags.map(tag => (
                <div key={tag.name} className={styles.tagRow}>
                  <span className={styles.tagCheckLabel}>
                    <TagColorDot color={tag.color} />
                    <span className={styles.tagChipText}>{tag.name}</span>
                  </span>
                  <div className={styles.tagActions}>
                    <Tooltip title="编辑标签">
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditTag(tag)} />
                    </Tooltip>
                    <Popconfirm
                      title="删除标签"
                      description="只会从标签库删除，不会改动已保存日记。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => handleDeleteTag(tag)}
                    >
                      <Tooltip title="删除标签">
                        <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  </div>
                </div>
              ))
            ) : (
              <p className={styles.emptyText}>暂无标签，先创建一个。</p>
            )}
          </div>
        </div>

        <div className={styles.tagEditorPanel}>
          <p className={styles.panelTitle}>{isEditingTag ? '编辑标签' : '创建标签'}</p>
          <div className={styles.tagForm}>
            <div className={styles.formLabel}>
              标签文本
              <Input value={draftName} placeholder="例如：阅读" onChange={event => setDraftName(event.target.value)} />
            </div>

            <div className={`${styles.formLabel} mb-8`}>
              标签颜色
              <span className={styles.colorInputRow}>
                <ColorPicker
                  value={draftColor}
                  // 统一保存为十六进制字符串，便于标签库持久化和回显。
                  onChange={color => setDraftColor(color.toHexString())}
                  aria-label="选择标签颜色"
                />
                <span className={styles.colorValue}>{draftColor.toUpperCase()}</span>
              </span>
            </div>

            <div className={styles.colorSwatches} aria-label="常用标签颜色">
              {TAG_COLOR_OPTIONS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorSwatch} ${color === draftColor ? styles.colorSwatchActive : ''}`}
                  style={{ backgroundColor: color }}
                  aria-label={`选择颜色 ${color}`}
                  onClick={() => setDraftColor(color)}
                />
              ))}
            </div>

            {formError ? <p className={styles.formError}>{formError}</p> : null}

            <div className={styles.formActions}>
              <Button className="mt-24 ml-auto" type="primary" icon={<PlusOutlined />} loading={isSubmitting} onClick={handleSubmitTag}>
                {isEditingTag ? '保存' : '创建'}
              </Button>
              {isEditingTag ? <Button onClick={resetForm}>取消编辑</Button> : null}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function TagColorDot({ color }: { color: string }) {
  return <span className={styles.tagColorDot} style={{ backgroundColor: color }} />
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '请确认通过 Electron 启动应用'
}

export default TagManagerDialog
