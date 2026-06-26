import { Button, Typography } from 'antd'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import logoUrl from '../assets/logo.svg'
import styles from '../layouts/AppShellLayout.module.scss'

const WELCOME_COMPLETED_STORAGE_KEY = 'echo-diary-welcome-completed'
const HOME_PATH = '/list'

const WELCOME_MOTION_STYLES = `
@keyframes echoWelcomeIn {
  from {
    opacity: 0;
    filter: blur(6px);
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

@keyframes echoWelcomeButtonIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.echo-welcome-logo,
.echo-welcome-slogan,
.echo-welcome-button {
  opacity: 0;
  will-change: opacity, transform, filter;
  animation-fill-mode: both;
}

.echo-welcome-logo {
  animation: echoWelcomeIn 1600ms ease-in-out 220ms both;
  width: 140px;
  height: auto;
  display: block;
}

.echo-welcome-slogan {
  animation: echoWelcomeIn 1900ms ease-in-out 900ms both;
}

.echo-welcome-button {
  animation: echoWelcomeButtonIn 1800ms ease-in-out 2600ms both;
}

@media (prefers-reduced-motion: reduce) {
  .echo-welcome-logo,
  .echo-welcome-slogan,
  .echo-welcome-button {
    opacity: 1;
    filter: none;
    transform: none;
    animation: none;
  }
}
`

type LaunchLocationState = {
  from?: unknown
}

function hasCompletedWelcome() {
  /*
   * 路由初始化时读取本机状态，决定是否还需要展示首次欢迎页。
   */
  return typeof window !== 'undefined' && window.localStorage.getItem(WELCOME_COMPLETED_STORAGE_KEY) === 'true'
}

function getRedirectPath(state: unknown) {
  const from = (state as LaunchLocationState | null)?.from

  /*
   * 只接受应用内绝对路径，避免启动页跳回自己或跳到非预期地址。
   */
  if (typeof from === 'string' && from.startsWith('/') && from !== '/welcome') {
    return from
  }

  return HOME_PATH
}

export function LaunchRedirect() {
  /*
   * 根路径只负责启动分流；完成首次欢迎后默认进入日记列表。
   */
  return <Navigate to={hasCompletedWelcome() ? HOME_PATH : '/welcome'} replace state={{ from: HOME_PATH }} />
}

export function LaunchGate() {
  const location = useLocation()

  if (hasCompletedWelcome()) {
    return <Outlet />
  }

  const targetPath = `${location.pathname}${location.search}${location.hash}`

  /*
   * 主应用路由首次进入前也要经过欢迎页，避免直接打开 /list 时跳过首次引导。
   */
  return <Navigate to="/welcome" replace state={{ from: targetPath || HOME_PATH }} />
}

export function WelcomePage() {
  const location = useLocation()
  const navigate = useNavigate()

  const handleStart = () => {
    /*
     * 首次确认后记录本机偏好，并直接进入主应用。
     */
    window.localStorage.setItem(WELCOME_COMPLETED_STORAGE_KEY, 'true')
    navigate(getRedirectPath(location.state), { replace: true })
  }

  /*
   * 欢迎页只承担首次进入的情绪确认，不放功能介绍，保持安静和留白。
   */
  return (
    <main className="min-h-screen bg-page px-32 text-foreground">
      {/* 内联动画只服务首次欢迎页，避免为了轻微动效新增样式文件。 */}
      <style>{WELCOME_MOTION_STYLES}</style>

      <section className="mx-auto flex min-h-screen w-full max-w-560 items-center justify-center py-56">
        <div className="flex flex-col items-center text-center">
          {/* 欢迎页复用品牌 logo 资源，避免首页标题和侧边栏品牌露出不一致。 */}
          <img className={`${styles.logoImage} echo-welcome-logo mb-18!`} src={logoUrl} alt="爱可日记" />
          <Typography.Text className="echo-welcome-slogan text-size-17 font-normal text-black-65">陪你记下每一天</Typography.Text>

          <Button
            type="primary"
            size="large"
            shape="round"
            className="echo-welcome-button mt-30 h-44 min-w-144 px-28 text-size-15"
            onClick={handleStart}
          >
            开始使用
          </Button>
        </div>
      </section>
    </main>
  )
}
