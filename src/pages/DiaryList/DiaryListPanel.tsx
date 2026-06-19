import { DeleteOutlined, EditOutlined, FilterOutlined, MoreOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Dropdown, Input } from 'antd'
import type { MenuProps } from 'antd'
import type { KeyboardEvent } from 'react'
import { useMemo } from 'react'
import type { Diary } from '../../../shared/diary'
import styles from './DiaryListPage.module.scss'
import type { DateFilterValue } from './types'

type DiaryListPanelProps = {
  dateFilter: DateFilterValue
  dateFilterMenuItems: MenuProps['items']
  diaries: Diary[]
  currentDateFilterLabel: string
  searchKeyword: string
  selectedDiaryId: string
  onDateFilterChange: (dateFilter: DateFilterValue) => void
  onDeleteDiary: (diary: Diary) => void
  onEditDiary: (diary: Diary) => void
  onSearchKeywordChange: (keyword: string) => void
  onSelectDiary: (diaryId: string) => void
}

function DiaryListPanel({
  dateFilter,
  dateFilterMenuItems,
  diaries,
  currentDateFilterLabel,
  searchKeyword,
  selectedDiaryId,
  onDateFilterChange,
  onDeleteDiary,
  onEditDiary,
  onSearchKeywordChange,
  onSelectDiary
}: DiaryListPanelProps) {
  const groupedDiaries = useMemo(() => {
    /*
     * 分组只影响左侧列表展示，因此放在列表组件内部维护。
     */
    const groups: Array<{ key: string; label: string; diaries: Diary[] }> = []

    diaries.forEach(diary => {
      const groupKey = formatDiaryMonthKey(diary)
      const existingGroup = groups.find(group => group.key === groupKey)

      if (existingGroup) {
        existingGroup.diaries.push(diary)
        return
      }

      groups.push({
        key: groupKey,
        label: formatDiaryMonthGroup(diary),
        diaries: [diary]
      })
    })

    return groups
  }, [diaries])

  const handleFilterIconKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    /*
     * 图标不是原生按钮，手动补齐键盘触发能力。
     */
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.currentTarget.click()
    }
  }

  return (
    <aside className={styles.diaryListPanel}>
      <div className={styles.diaryListToolbar}>
        <Input
          allowClear
          variant="borderless"
          prefix={<SearchOutlined />}
          placeholder="搜索日记标题"
          value={searchKeyword}
          onChange={event => onSearchKeywordChange(event.target.value)}
        />
        <Dropdown
          trigger={['click']}
          menu={{
            items: dateFilterMenuItems,
            selectedKeys: [dateFilter],
            onClick: ({ key }) => onDateFilterChange(key as DateFilterValue)
          }}
          placement="bottomRight"
        >
          <FilterOutlined
            className={styles.diaryDateFilterIcon}
            role="button"
            tabIndex={0}
            aria-label={`按创建时间筛选，当前：${currentDateFilterLabel}`}
            onKeyDown={handleFilterIconKeyDown}
          />
        </Dropdown>
      </div>

      <div className={styles.diaryListScrollArea}>
        {groupedDiaries.length === 0 ? (
          <div className={styles.diaryListNoResult}>
            <h2>没有匹配的日记</h2>
            <p>换个标题关键词或筛选条件试试。</p>
          </div>
        ) : (
          groupedDiaries.map(group => (
            <section key={group.key} className={styles.diaryListGroup}>
              <div className={styles.groupLabel}>{group.label}</div>
              <ul className={styles.diaryList}>
                {group.diaries.map(diary => {
                  const isSelected = diary.id === selectedDiaryId

                  return (
                    <li
                      key={diary.id}
                      className={isSelected ? `${styles.diaryListItem} ${styles.diaryListItemActive}` : styles.diaryListItem}
                      onClick={() => onSelectDiary(diary.id)}
                    >
                      <div className={styles.diaryListActions}>
                        <Dropdown
                          trigger={['click']}
                          placement="bottomRight"
                          menu={{
                            items: [
                              {
                                key: 'edit',
                                label: '编辑',
                                icon: <EditOutlined />
                              },
                              {
                                key: 'delete',
                                label: '删除',
                                danger: true,
                                icon: <DeleteOutlined />
                              }
                            ],
                            onClick: ({ key, domEvent }) => {
                              /*
                               * 菜单点击不应触发 li 的选中事件，避免操作时预览区跳动。
                               */
                              domEvent.stopPropagation()

                              if (key === 'edit') {
                                onEditDiary(diary)
                                return
                              }

                              onDeleteDiary(diary)
                            }
                          }}
                        >
                          <Button
                            type="text"
                            shape="circle"
                            className={styles.diaryListActionTrigger}
                            icon={<MoreOutlined />}
                            aria-label={`${diary.title} 更多操作`}
                            onClick={event => event.stopPropagation()}
                          />
                        </Dropdown>
                      </div>
                      <div className={`${styles.diaryListDate} text-size-14 mb-4`}>{formatCreatedTime(diary.createdAt)}</div>
                      <div className={styles.diaryListTitle}>{diary.title}</div>
                      <div className={`${styles.diaryListSummary} mt-8`}>{buildDiaryMetaSummary(diary)}</div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  )
}

/**
 * 构建列表元信息摘要
 * 列表不读取 Markdown 正文，只展示可由数据库索引直接提供的信息
 */
function buildDiaryMetaSummary(diary: Diary): string {
  const summaryParts = [
    diary.mood ? `心情：${diary.mood}` : '',
    diary.tags?.length ? `标签：${diary.tags.join(' / ')}` : '',
    `更新：${formatUpdatedAt(diary.updatedAt)}`
  ].filter(Boolean)

  return summaryParts.join(' · ')
}

/**
 * 格式化日记月份分组 key
 * 返回 YYYY-MM，让同一月份的日记落入同一个分组
 */
function formatDiaryMonthKey(diary: Diary): string {
  const diaryDateParts = parseDiaryDateParts(diary.diaryDate)

  if (diaryDateParts) {
    return `${diaryDateParts.year}-${String(diaryDateParts.month).padStart(2, '0')}`
  }

  return formatCreatedMonthKey(diary.createdAt)
}

/**
 * 格式化日记月份分组标题
 * 用 2026·6月 这样的格式展示月份
 */
function formatDiaryMonthGroup(diary: Diary): string {
  const diaryDateParts = parseDiaryDateParts(diary.diaryDate)

  if (diaryDateParts) {
    return `${diaryDateParts.year}·${diaryDateParts.month}月`
  }

  return formatCreatedDateGroup(diary.createdAt)
}

/**
 * 解析日记日期字符串
 * 只接受 YYYY-MM-DD，避免 Date 解析时区差异影响月份
 */
function parseDiaryDateParts(diaryDate: string): { year: number; month: number; day: number } | null {
  const matchedDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(diaryDate)

  if (!matchedDate) {
    return null
  }

  const year = Number(matchedDate[1])
  const month = Number(matchedDate[2])
  const day = Number(matchedDate[3])

  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  return { year, month, day }
}

/**
 * 格式化创建月份分组 key
 * 旧数据没有 diaryDate 时使用 createdAt 兜底
 */
function formatCreatedMonthKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

/**
 * 格式化创建月份分组标题
 * 用中文月份展示兜底分组信息
 */
function formatCreatedDateGroup(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}·${date.getMonth() + 1}月`
}

/**
 * 格式化创建时间
 * 列表项只展示当天内的时间，节省左侧空间
 */
function formatCreatedTime(timestamp: number): string {
  const date = new Date(timestamp)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`
}

/**
 * 格式化更新时间
 * 将时间戳转换为列表摘要里的日期时间格式
 */
function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

export default DiaryListPanel
