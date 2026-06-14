import EchoButton from './components/EchoButton'
import './App.scss'

function App() {
  /*
   * 当前页面只展示按钮组件的两个基础变体。
   * 其它日记本页面结构先不放进来，避免在组件还未稳定时引入额外复杂度。
   */
  return (
    <div className="app-shell">
      <div className="side-bar"></div>
      <div className="main-container"></div>
    </div>
  )
}

export default App
