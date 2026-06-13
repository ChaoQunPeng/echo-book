import { useState } from 'react'
import { Layout, Menu, Button, Space, Typography, Card, Input } from 'antd'
import { BookOutlined, EditOutlined, CheckOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import './App.scss'

const { Sider, Content } = Layout
const { Title, Paragraph } = Typography

// 模拟一些初始日记数据
const initialDiaries = [
  { id: '1', title: '2026-06-13 启动新项目', content: '今天开始用 Tauri 和 React 写日记应用了，启动！很棒！' },
  { id: '2', title: '2026-06-12 构思架构', content: '打算做一个本地优先（Local-first）的日记本，数据全在本地，隐私安全拉满。' }
]

function App() {
  // 日记数据状态
  const [diaries, setDiaries] = useState(initialDiaries)
  // 当前选中的日记 ID
  const [activeId, setActiveId] = useState('1')
  // 是否处于编辑模式
  const [isEditing, setIsEditing] = useState(false)
  // 临时编辑内容缓存
  const [editContent, setEditContent] = useState('')

  // 获取当前选中的日记对象
  const currentDiary = diaries.find(d => d.id === activeId) || diaries[0]

  // 处理切换日记
  const handleSelectDiary = (id: string) => {
    setActiveId(id)
    setIsEditing(false) // 切换日记时自动退出编辑模式
  }

  // 进入编辑状态
  const enterEditMode = () => {
    setEditContent(currentDiary?.content || '')
    setIsEditing(true)
  }

  // 保存编辑内容
  const handleSave = () => {
    setDiaries(prev => prev.map(d => (d.id === activeId ? { ...d, content: editContent } : d)))
    setIsEditing(false)
    // TODO: 这里后续可以调用 Tauri 的 invoke('save_diary_to_disk', { ... }) 将数据持久化到本地 Markdown/JSON 文件
  }

  // 组装左侧目录菜单项
  const menuItems = diaries.map(d => ({
    key: d.id,
    icon: <FileTextOutlined />,
    label: d.title
  }))

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* 左侧侧边栏：目录 */}
      <Sider
        theme="light"
        width={260}
        style={{
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0, fontSize: '16px' }}>
            <BookOutlined style={{ marginRight: 8 }} />
            我的拾光
          </Title>
          <Button type="text" icon={<PlusOutlined />} title="新建日记" />
        </div>

        <Menu
          mode="inline"
          selectedKeys={[activeId]}
          items={menuItems}
          onClick={({ key }) => handleSelectDiary(String(key))}
          style={{ borderRight: 0, flex: 1, overflowY: 'auto' }}
        />
      </Sider>

      {/* 右侧主体：预览 / 编辑 */}
      <Layout>
        <Content className="min-h-screen bg-slate-50">
          <div>白酒</div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
