import { DeleteOutlined, EditOutlined, FilterOutlined, MoreOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Dropdown, Input } from 'antd'
import type { MenuProps } from 'antd'
import type { ChangeEvent, CompositionEvent, KeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Diary } from '../../../shared/diary'
import { formatMood } from '../../../shared/moods'
import { formatWeather } from '../../../shared/weather'
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
  onSearchKeywordChange
}: DiaryListPanelProps) {
  const navigate = useNavigate()
  const isComposingSearchRef = useRef(false)
  const [searchInputValue, setSearchInputValue] = useState(searchKeyword)
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

  useEffect(() => {
    /*
     * 外部清空或恢复搜索词时同步输入框；中文输入法组词期间交给本地值维护。
     */
    if (!isComposingSearchRef.current) {
      setSearchInputValue(searchKeyword)
    }
  }, [searchKeyword])

  const handleSearchInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextKeyword = event.target.value

    setSearchInputValue(nextKeyword)

    if (!isComposingSearchRef.current) {
      onSearchKeywordChange(nextKeyword)
    }
  }

  const handleSearchCompositionStart = () => {
    /*
     * 拼音候选还没上屏时不触发真正搜索，避免输入过程反复刷新列表。
     */
    isComposingSearchRef.current = true
  }

  const handleSearchCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    const nextKeyword = event.currentTarget.value

    isComposingSearchRef.current = false
    setSearchInputValue(nextKeyword)
    onSearchKeywordChange(nextKeyword)
  }

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
    <aside className="flex w-320 flex-col overflow-hidden border-r border-[rgba(15,82,56,0.12)] bg-page">
      <div className="flex flex-[0_0_auto] gap-10 border-b border-[rgba(25,28,29,0.08)] bg-white p-12">
        <Input
          allowClear
          className="min-w-0 flex-1"
          variant="borderless"
          prefix={<SearchOutlined />}
          placeholder="搜索标题或正文"
          value={searchInputValue}
          onChange={handleSearchInputChange}
          onCompositionStart={handleSearchCompositionStart}
          onCompositionEnd={handleSearchCompositionEnd}
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
            className="inline-flex h-32 w-32 flex-[0_0_32px] cursor-pointer items-center justify-center rounded-[6px] text-[rgba(25,28,29,0.72)] transition-colors duration-[160ms] ease-in-out hover:bg-[rgba(15,82,56,0.08)] hover:text-primary focus-visible:bg-[rgba(15,82,56,0.08)] focus-visible:text-primary focus-visible:outline-none"
            role="button"
            tabIndex={0}
            aria-label={`按创建时间筛选，当前：${currentDateFilterLabel}`}
            onKeyDown={handleFilterIconKeyDown}
          />
        </Dropdown>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {groupedDiaries.length === 0 ? (
          <div className="grid h-full min-h-280 place-items-center content-center gap-8 text-center text-[rgba(25,28,29,0.62)]">
            <h2 className="text-size-18 text-foreground">没有匹配的日记</h2>
            <p>换个关键词或筛选条件试试。</p>
          </div>
        ) : (
          groupedDiaries.map(group => (
            <section key={group.key}>
              <div className="px-24 py-16">{group.label}</div>
              <ul className="flex list-none flex-col gap-6">
                {group.diaries.map(diary => {
                  return (
                    <li key={diary.id} className="relative">
                      <div
                        role="button"
                        tabIndex={0}
                        className={
                          [
                            'relative block cursor-pointer bg-white py-24 pl-24 pr-56 text-inherit no-underline transition-all duration-[160ms] ease-in-out hover:border-l-[3px] hover:border-primary hover:bg-[color-mix(in_srgb,var(--echo-color-primary)_5%,#ffffff)]',
                            diary.id === selectedDiaryId
                              ? 'border-l-[3px] border-primary bg-[color-mix(in_srgb,var(--echo-color-primary)_5%,#ffffff)]'
                              : ''
                          ]
                            .filter(Boolean)
                            .join(' ')
                        }
                        onClick={() => navigate(`/list/${diary.id}`)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(`/list/${diary.id}`)
                          }
                        }}
                      >
                        <div className="mb-4 text-size-14 text-primary">{formatCreatedTime(diary.createdAt)}</div>
                        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-size-16 text-foreground">{diary.title}</div>
                        <div className="mt-8 overflow-hidden text-ellipsis whitespace-nowrap text-size-12 leading-[1.5] text-[rgba(25,28,29,0.62)]">
                          {buildDiaryMetaSummary(diary)}
                        </div>
                      </div>
                      <div className="absolute right-14 top-14">
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
                               * 菜单点击不进入当前日记路由，只执行编辑或删除动作。
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
                            className="h-30! w-30! text-[rgba(25,28,29,0.58)] hover:bg-[rgba(15,82,56,0.08)]! hover:text-primary! focus-visible:bg-[rgba(15,82,56,0.08)]! focus-visible:text-primary!"
                            icon={<MoreOutlined />}
                            aria-label={`${diary.title} 更多操作`}
                            onClick={event => event.stopPropagation()}
                          />
                        </Dropdown>
                      </div>
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
    diary.mood ? `心情：${formatMood(diary.mood)?.name ?? diary.mood}` : '',
    diary.weather ? `天气：${formatWeather(diary.weather)?.name ?? diary.weather}` : '',
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
  /*
   * diaryDate 暂时不在界面使用，列表分组直接跟随创建时间。
   */
  return formatCreatedMonthKey(diary.createdAt)
}

/**
 * 格式化日记月份分组标题
 * 用 2026·6月 这样的格式展示月份
 */
function formatDiaryMonthGroup(diary: Diary): string {
  /*
   * 分组标题和分组 key 使用同一时间口径，避免同一条日记被显示到不同月份。
   */
  return formatCreatedDateGroup(diary.createdAt)
}

/**
 * 格式化创建月份分组 key
 * 使用 createdAt 生成稳定分组 key
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
