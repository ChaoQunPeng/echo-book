import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getStorageRootPath } from "../db/connection.js";

const ERROR_LOG_DIRECTORY_NAME = "errorLog";
const ERROR_LOG_FILE_PREFIX = "errorLog";

export type ErrorLogDetail = unknown;

function padDateNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = padDateNumber(date.getMonth() + 1);
  const day = padDateNumber(date.getDate());

  return `${year}${month}${day}`;
}

function serializeErrorLogDetail(detail: ErrorLogDetail): string {
  if (detail === undefined) {
    return "";
  }

  if (detail instanceof Error) {
    return detail.stack ?? detail.message;
  }

  if (typeof detail === "string") {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export function getErrorLogDirectoryPath(): string {
  return path.join(getStorageRootPath(), ERROR_LOG_DIRECTORY_NAME);
}

export function getTodayErrorLogFilePath(): string {
  const fileName = `${ERROR_LOG_FILE_PREFIX}_${formatDateKey(new Date())}.log`;

  return path.join(getErrorLogDirectoryPath(), fileName);
}

export function hasTodayErrorLogFile(): boolean {
  return fs.existsSync(getTodayErrorLogFilePath());
}

export function copyTodayErrorLogFile(targetPath: string): string {
  const sourcePath = getTodayErrorLogFilePath();
  const finalTargetPath = targetPath.toLowerCase().endsWith(".log") ? targetPath : `${targetPath}.log`;

  fs.copyFileSync(sourcePath, finalTargetPath);

  return finalTargetPath;
}

export function appendErrorLog(source: string, message: string, detail?: ErrorLogDetail): void {
  const detailText = serializeErrorLogDetail(detail);
  const hasDetailText = detailText.trim().length > 0;
  const logLines = [
    `[${new Date().toISOString()}] [${source}] [${process.platform}] [${app.getVersion()}] ${message}`,
    hasDetailText ? detailText : "",
    "",
  ].filter(line => line.length > 0);

  try {
    /*
     * 错误日志放在应用数据根目录下，和 database、echoBookNotes 平级，方便用户备份和导出。
     */
    fs.mkdirSync(getErrorLogDirectoryPath(), { recursive: true });
    fs.appendFileSync(getTodayErrorLogFilePath(), `${logLines.join("\n")}\n`, "utf8");
  } catch (error) {
    console.error("Failed to append app error log:", error);
  }
}
