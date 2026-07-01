const fs = require('node:fs')
const path = require('node:path')

function getResourcesPath(context) {
  if (context.electronPlatformName !== 'darwin') {
    return path.join(context.appOutDir, 'resources')
  }

  const appDirectoryName = fs.readdirSync(context.appOutDir).find(name => name.endsWith('.app'))
  return appDirectoryName ? path.join(context.appOutDir, appDirectoryName, 'Contents', 'Resources') : null
}

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true })
}

/**
 * 前端依赖已经由 Vite 打包进 dist，这里只放编译产物和主进程运行依赖。
 * 避免把完整 node_modules 重复塞进 app.asar，安装包会小很多。
 */
module.exports = {
  appId: 'com.echobook.app',
  productName: '爱可日记',
  files: ['dist/**', 'dist-electron/**', 'package.json'],
  compression: 'maximum',
  electronLanguages: ['zh_CN', 'zh_TW', 'en'],
  directories: {
    output: 'release'
  },
  dmg: {
    // 使用纯色背景时，下面的窗口尺寸会稳定生效，避免默认背景图压缩可视区域。
    backgroundColor: '#ffffff',
    iconSize: 88,
    iconTextSize: 13,
    window: {
      width: 800,
      height: 500
    },
    contents: [
      { x: 120, y: 170, type: 'file', path: 'support/爱可日记安装说明.png', name: '请先点我~.png' },
      { x: 300, y: 170, type: 'file', name: '爱可日记.app' },
      { x: 480, y: 170, type: 'link', path: '/Applications' },
      { x: 660, y: 170, type: 'file', path: 'support/爱可日记启动助手.command', name: '爱可日记启动助手.command' }
    ]
  },
  async afterPack(context) {
    const resourcesPath = getResourcesPath(context)
    if (!resourcesPath) {
      return
    }

    const betterSqliteUnpackedPath = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3')

    /**
     * better-sqlite3 运行时只需要 JS 包装代码和 better_sqlite3.node。
     * 这些源码、obj 和测试扩展是编译残留，删掉不会影响数据库加载。
     */
    for (const relativePath of ['bin', 'deps', 'src', 'build/deps', 'build/Release/obj', 'build/Release/test_extension.node']) {
      removeIfExists(path.join(betterSqliteUnpackedPath, relativePath))
    }
  },
  mac: {
    category: 'public.app-category.productivity',
    // macOS 安装包和 .app 使用的应用图标。
    icon: 'build/icon.icns',
    // macOS Electron locale 目录使用 zh_CN.lproj 这类下划线命名。
    electronLanguages: ['zh_CN'],
    target: ['dmg', 'dir']
  },
  win: {
    // Windows 安装包、快捷方式和任务栏使用的应用图标。
    icon: 'build/icon.ico',
    // Windows Electron locale 文件使用 zh-CN.pak 这类连字符命名。
    electronLanguages: ['zh-CN'],
    target: ['nsis', 'portable']
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  }
}
