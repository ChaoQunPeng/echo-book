import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptFilePath), "..");
const electronDistDir = path.join(projectRoot, "dist-electron");
const electronDistPackagePath = path.join(electronDistDir, "package.json");

/**
 * Electron 主进程编译产物需要一个离它最近的 package.json 来声明 CommonJS。
 *
 * 根目录 package.json 使用 "type": "module"，这对 Vite / 前端代码是合理的；
 * 但如果 dist-electron 下没有自己的 package.json，Node/Electron 会沿目录向上找到
 * 根目录的 "type": "module"，然后把 dist-electron/electron/main.js 当成 ESM 加载。
 *
 * 这里在每次 electron:build 后写入一个极小的 package.json，让编译后的 main.js、
 * db/connection.js、ipc/diaryIpc.js 等文件都稳定按 CommonJS 执行。
 */
await mkdir(electronDistDir, { recursive: true });
await writeFile(
  electronDistPackagePath,
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
  "utf8",
);
