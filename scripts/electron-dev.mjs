import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const scriptFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFilePath), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCommand = process.platform === "win32" ? "electron.cmd" : "electron";
const electronBinPath = path.join(projectRoot, "node_modules", ".bin", electronCommand);
const viteDevServerUrl = "http://localhost:5173";

let viteProcess;
let electronProcess;
let isShuttingDown = false;

/**
 * 运行一次性命令，并在命令失败时把退出码传递给当前脚本。
 *
 * 这里用于先编译 Electron main/preload 入口。`package.json` 的 main 指向
 * dist-electron/electron/main.js，如果没有这一步，Electron 会直接报
 * "Unable to find Electron app" 或 "Cannot find module"。
 */
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}.`));
    });
  });
}

/**
 * 启动一个长期运行的子进程。
 *
 * Vite 和 Electron 都需要保持运行，所以不能用 execSync 这类阻塞式 API。
 * 统一在这里启动，便于退出当前脚本时一起清理子进程。
 */
function startProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...options.env,
    },
  });

  child.on("error", (error) => {
    console.error(error);
    shutdown(1);
  });

  return child;
}

/**
 * 等待 Vite dev server 真正可访问。
 *
 * Electron 主窗口在开发模式下会加载 http://localhost:5173。即使 Vite 进程已经
 * 创建，端口也需要一点时间完成监听；这里轮询到页面可访问后再启动 Electron，
 * 避免窗口打开时出现空白页或连接失败。
 */
async function waitForViteServer() {
  const startedAt = Date.now();
  const timeoutMs = 30_000;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(viteDevServerUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Vite 还没有完成监听时 fetch 会失败，继续等待即可。
    }

    await delay(300);
  }

  throw new Error(`Timed out waiting for Vite dev server at ${viteDevServerUrl}.`);
}

/**
 * 统一关闭子进程。
 *
 * 当 Electron 窗口被关闭、用户按 Ctrl+C，或者脚本自身遇到错误时，都走同一套
 * 清理逻辑，避免 Vite dev server 留在后台占用 5173 端口。
 */
function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill();
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  await runCommand(npmCommand, ["run", "electron:build"]);
  /**
   * better-sqlite3 这类 native addon 会生成 .node 二进制文件，必须匹配实际加载它的
   * Node ABI。开发机的 Node 版本可能和 Electron 内置 Node 版本不同：
   * - 普通 `npm install` / `npm rebuild` 会按当前终端里的 Node 编译
   * - Electron main process 运行时会按 Electron 自带的 Node 加载
   *
   * 因此每次开发启动 Electron 前都先执行 electron-rebuild，确保
   * node_modules/better-sqlite3/build/Release/better_sqlite3.node 面向 Electron ABI。
   */
  await runCommand(npmCommand, ["run", "electron:rebuild"]);

  viteProcess = startProcess(npmCommand, ["run", "dev"], {
    env: {
      BROWSER: "none",
    },
  });

  await waitForViteServer();

  electronProcess = startProcess(electronBinPath, ["."]);
  electronProcess.on("exit", (code) => {
    shutdown(code ?? 0);
  });
} catch (error) {
  console.error(error);
  shutdown(1);
}
