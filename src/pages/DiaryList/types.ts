/*
 * 列表页筛选值在页面和列表组件间共享，集中声明可以避免字符串散落。
 */
export type DateFilterValue = 'all' | 'last7' | 'last30' | 'thisYear'
