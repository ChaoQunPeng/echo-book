import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, ColorPicker, Input, Modal, Popconfirm, Tooltip } from 'antd'
import { useEffect, useState } from 'react'
import type { TagLibraryItem } from '../../../shared/tags'

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
      footer={null}
      width={640}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-32 max-[720px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-12">
          <p className="text-size-13 text-[rgba(25,28,29,0.7)]">标签库</p>
          <div className="flex flex-col gap-12">
            {storedTags.length ? (
              storedTags.map(tag => (
                <div
                  key={tag.name}
                  className="grid min-h-40 grid-cols-[1fr_auto] items-center gap-8 rounded-[8px] border border-[rgba(25,28,29,0.1)] bg-white px-8 py-6"
                >
                  <span className="inline-flex min-w-0 items-center gap-8">
                    <TagColorDot color={tag.color} />
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tag.name}</span>
                  </span>
                  <div className="flex gap-4">
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
              <p className="text-size-13 leading-[1.5] text-color-base-45">暂无标签，先创建一个。</p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-12">
          <p className="text-size-13 text-[rgba(25,28,29,0.7)]">{isEditingTag ? '编辑标签' : '创建标签'}</p>
          <div className="flex flex-col gap-18">
            <div className="flex flex-col gap-6 text-size-13 text-[rgba(25,28,29,0.68)]">
              标签文本
              <Input value={draftName} placeholder="例如：阅读" onChange={event => setDraftName(event.target.value)} />
            </div>

            <div className="mb-8 flex flex-col gap-6 text-size-13 text-[rgba(25,28,29,0.68)]">
              标签颜色
              <span className="flex items-center gap-8">
                <ColorPicker
                  value={draftColor}
                  // 统一保存为十六进制字符串，便于标签库持久化和回显。
                  onChange={color => setDraftColor(color.toHexString())}
                  aria-label="选择标签颜色"
                />
                <span className="text-size-13 text-[rgba(25,28,29,0.55)]">{draftColor.toUpperCase()}</span>
              </span>
            </div>

            <div className="grid grid-cols-[repeat(6,24px)] gap-18" aria-label="常用标签颜色">
              {TAG_COLOR_OPTIONS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={[
                    'h-24 w-24 cursor-pointer rounded-full border border-[rgba(25,28,29,0.12)]',
                    color === draftColor ? 'outline-2 outline-offset-2 outline-primary' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ backgroundColor: color }}
                  aria-label={`选择颜色 ${color}`}
                  onClick={() => setDraftColor(color)}
                />
              ))}
            </div>

            {formError ? <p className="text-size-13 leading-[1.5] text-[#b42318]">{formError}</p> : null}

            <div className="flex flex-wrap gap-8">
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
  return <span className="h-8 w-8 flex-[0_0_auto] rounded-full" style={{ backgroundColor: color }} />
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '请确认通过 Electron 启动应用'
}

export default TagManagerDialog
