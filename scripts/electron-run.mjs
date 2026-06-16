import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFilePath), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCommand = process.platform === "win32" ? "electron.cmd" : "electron";
const electronBinPath = path.join(projectRoot, "node_modules", ".bin", electronCommand);

/**
 * 顺序执行一次性命令。
 *
 * 普通 Electron 启动入口需要先编译 main/preload，再重建 better-sqlite3 的
 * Electron ABI 二进制，最后才启动桌面应用。
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
 * 启动真正的 Electron 桌面主进程。
 *
 * ELECTRON_RUN_AS_NODE=1 会让 Electron 以 Node 模式运行，导致 main process 中
 * require("electron").app 为 undefined；这里显式删除它，避免设置/日记 IPC 无法注册。
 */
function startElectron() {
  const electronEnv = {
    ...process.env,
  };

  delete electronEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronBinPath, ["."], {
    cwd: projectRoot,
    stdio: "inherit",
    env: electronEnv,
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

try {
  await runCommand(npmCommand, ["run", "electron:build"]);
  await runCommand(npmCommand, ["run", "electron:rebuild"]);
  startElectron();
} catch (error) {
  console.error(error);
  process.exit(1);
}
