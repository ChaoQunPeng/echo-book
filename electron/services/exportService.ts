import fs from "node:fs";
import path from "node:path";

interface BackupSource {
  sourcePath: string;
  archivePath: string;
}

interface BackupTextFile {
  archivePath: string;
  content: string;
  mtime?: Date;
}

interface ZipEntry {
  absolutePath: string | null;
  content: Buffer | null;
  archivePath: string;
  isDirectory: boolean;
  size: number;
  mtime: Date;
  crc32: number;
  localHeaderOffset: number;
}

const ZIP_STORE_METHOD = 0;
const ZIP_VERSION_NEEDED = 20;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const CRC32_TABLE = createCrc32Table();

/**
 * 将指定目录打包成一个标准 ZIP 文件。
 *
 * 这里没有引入第三方压缩库，而是写入 ZIP 的 store method：
 * - 优点：依赖少、构建稳定、Electron main process 可以直接使用 Node fs 完成备份
 * - 取舍：不会压缩体积，但数据库和 Markdown 通常不大，备份可读性和可靠性更重要
 */
export function createStorageBackupZip(
  outputPath: string,
  sources: BackupSource[],
  textFiles: BackupTextFile[] = [],
): void {
  const normalizedOutputPath = ensureZipExtension(outputPath);
  const temporaryOutputPath = `${normalizedOutputPath}.tmp-${Date.now()}`;
  const entries = collectZipEntries(sources, normalizedOutputPath, textFiles);

  fs.mkdirSync(path.dirname(normalizedOutputPath), { recursive: true });

  let fileDescriptor: number | null = null;
  let position = 0;

  try {
    fileDescriptor = fs.openSync(temporaryOutputPath, "w");

    for (const entry of entries) {
      entry.localHeaderOffset = position;
      position += writeLocalFileHeader(fileDescriptor, entry);

      if (!entry.isDirectory && entry.content) {
        position += writeBuffers(fileDescriptor, [entry.content]);
      } else if (!entry.isDirectory && entry.absolutePath) {
        position += writeFileData(fileDescriptor, entry.absolutePath);
      }
    }

    const centralDirectoryOffset = position;
    for (const entry of entries) {
      position += writeCentralDirectoryHeader(fileDescriptor, entry);
    }

    const centralDirectorySize = position - centralDirectoryOffset;
    position += writeEndOfCentralDirectory(fileDescriptor, {
      entryCount: entries.length,
      centralDirectorySize,
      centralDirectoryOffset,
    });

    /*
     * fsync 能减少“系统刚显示导出完成但文件还在缓存里”的风险。
     * 对备份文件来说，宁愿多花一点时间，也要尽量确保落盘状态可靠。
     */
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = null;

    fs.renameSync(temporaryOutputPath, normalizedOutputPath);
  } catch (error) {
    if (fileDescriptor !== null) {
      fs.closeSync(fileDescriptor);
    }

    if (fs.existsSync(temporaryOutputPath)) {
      fs.unlinkSync(temporaryOutputPath);
    }

    throw error;
  }
}

function collectZipEntries(
  sources: BackupSource[],
  outputPath: string,
  textFiles: BackupTextFile[],
): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const seenArchivePaths = new Set<string>();
  const excludedOutputPath = path.resolve(outputPath);

  for (const textFile of textFiles) {
    pushTextFileEntry(entries, seenArchivePaths, textFile);
  }

  for (const source of sources) {
    const sourcePath = path.resolve(source.sourcePath);
    const archivePath = normalizeArchivePath(source.archivePath, true);

    if (!fs.existsSync(sourcePath)) {
      /*
       * 备份应该保留固定的 database/notes 顶层结构。
       * 即使某个目录暂时不存在，也写入一个空目录项，方便用户解压后理解结构。
       */
      pushDirectoryEntry(entries, seenArchivePaths, archivePath, new Date());
      continue;
    }

    walkSourceDirectory(sourcePath, archivePath, excludedOutputPath, entries, seenArchivePaths);
  }

  if (entries.length > UINT16_MAX) {
    throw new Error("Too many files to export as a simple ZIP backup.");
  }

  return entries;
}

function walkSourceDirectory(
  absolutePath: string,
  archivePath: string,
  excludedOutputPath: string,
  entries: ZipEntry[],
  seenArchivePaths: Set<string>,
): void {
  const stat = fs.lstatSync(absolutePath);

  if (stat.isSymbolicLink()) {
    /*
     * 备份只打包应用自己真实拥有的文件。
     * 跳过符号链接可以避免用户无意中把 notes 之外的系统文件带进备份包。
     */
    return;
  }

  if (stat.isDirectory()) {
    pushDirectoryEntry(entries, seenArchivePaths, normalizeArchivePath(archivePath, true), stat.mtime);

    const children = fs.readdirSync(absolutePath).sort((left, right) => left.localeCompare(right));
    for (const childName of children) {
      walkSourceDirectory(
        path.join(absolutePath, childName),
        `${normalizeArchivePath(archivePath, true)}${childName}`,
        excludedOutputPath,
        entries,
        seenArchivePaths,
      );
    }

    return;
  }

  if (!stat.isFile() || path.resolve(absolutePath) === excludedOutputPath) {
    return;
  }

  if (stat.size > UINT32_MAX) {
    throw new Error(`File is too large for this ZIP backup: ${absolutePath}`);
  }

  const normalizedArchivePath = normalizeArchivePath(archivePath, false);
  if (seenArchivePaths.has(normalizedArchivePath)) {
    return;
  }

  seenArchivePaths.add(normalizedArchivePath);
  entries.push({
    absolutePath,
    content: null,
    archivePath: normalizedArchivePath,
    isDirectory: false,
    size: stat.size,
    mtime: stat.mtime,
    crc32: calculateFileCrc32(absolutePath),
    localHeaderOffset: 0,
  });
}

function pushDirectoryEntry(
  entries: ZipEntry[],
  seenArchivePaths: Set<string>,
  archivePath: string,
  mtime: Date,
): void {
  const normalizedArchivePath = normalizeArchivePath(archivePath, true);

  if (seenArchivePaths.has(normalizedArchivePath)) {
    return;
  }

  seenArchivePaths.add(normalizedArchivePath);
  entries.push({
    absolutePath: null,
    content: null,
    archivePath: normalizedArchivePath,
    isDirectory: true,
    size: 0,
    mtime,
    crc32: 0,
    localHeaderOffset: 0,
  });
}

function pushTextFileEntry(entries: ZipEntry[], seenArchivePaths: Set<string>, textFile: BackupTextFile): void {
  const normalizedArchivePath = normalizeArchivePath(textFile.archivePath, false);

  if (seenArchivePaths.has(normalizedArchivePath)) {
    return;
  }

  const content = Buffer.from(textFile.content, "utf8");
  if (content.length > UINT32_MAX) {
    throw new Error(`Text file is too large for this ZIP backup: ${normalizedArchivePath}`);
  }

  /*
   * 说明文件不是磁盘里的业务数据，而是导出时临时生成的“虚拟文件”。
   * 它和真实文件走同一套 ZIP header，区别只是内容直接来自内存 Buffer。
   */
  seenArchivePaths.add(normalizedArchivePath);
  entries.push({
    absolutePath: null,
    content,
    archivePath: normalizedArchivePath,
    isDirectory: false,
    size: content.length,
    mtime: textFile.mtime ?? new Date(),
    crc32: calculateBufferCrc32(content),
    localHeaderOffset: 0,
  });
}

function writeLocalFileHeader(fileDescriptor: number, entry: ZipEntry): number {
  const fileName = Buffer.from(entry.archivePath, "utf8");
  const { dosTime, dosDate } = toDosDateTime(entry.mtime);
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(ZIP_STORE_METHOD, 8);
  header.writeUInt16LE(dosTime, 10);
  header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(entry.size, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(fileName.length, 26);
  header.writeUInt16LE(0, 28);

  assertZipPathLength(fileName, entry.archivePath);
  assertZipOffset(entry.localHeaderOffset);

  return writeBuffers(fileDescriptor, [header, fileName]);
}

function writeCentralDirectoryHeader(fileDescriptor: number, entry: ZipEntry): number {
  const fileName = Buffer.from(entry.archivePath, "utf8");
  const { dosTime, dosDate } = toDosDateTime(entry.mtime);
  const header = Buffer.alloc(46);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(ZIP_VERSION_NEEDED, 4);
  header.writeUInt16LE(ZIP_VERSION_NEEDED, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(ZIP_STORE_METHOD, 10);
  header.writeUInt16LE(dosTime, 12);
  header.writeUInt16LE(dosDate, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(fileName.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(entry.isDirectory ? 0x10 : 0, 38);
  header.writeUInt32LE(entry.localHeaderOffset, 42);

  assertZipPathLength(fileName, entry.archivePath);
  assertZipOffset(entry.localHeaderOffset);

  return writeBuffers(fileDescriptor, [header, fileName]);
}

function writeEndOfCentralDirectory(
  fileDescriptor: number,
  options: {
    entryCount: number;
    centralDirectorySize: number;
    centralDirectoryOffset: number;
  },
): number {
  assertZipOffset(options.centralDirectorySize);
  assertZipOffset(options.centralDirectoryOffset);

  const header = Buffer.alloc(22);

  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(options.entryCount, 8);
  header.writeUInt16LE(options.entryCount, 10);
  header.writeUInt32LE(options.centralDirectorySize, 12);
  header.writeUInt32LE(options.centralDirectoryOffset, 16);
  header.writeUInt16LE(0, 20);

  return writeBuffers(fileDescriptor, [header]);
}

function writeFileData(fileDescriptor: number, absolutePath: string): number {
  const sourceFileDescriptor = fs.openSync(absolutePath, "r");
  const chunk = Buffer.alloc(1024 * 1024);
  let bytesWritten = 0;

  try {
    while (true) {
      const bytesRead = fs.readSync(sourceFileDescriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        break;
      }

      fs.writeSync(fileDescriptor, chunk, 0, bytesRead);
      bytesWritten += bytesRead;
    }
  } finally {
    fs.closeSync(sourceFileDescriptor);
  }

  return bytesWritten;
}

function writeBuffers(fileDescriptor: number, buffers: Buffer[]): number {
  let bytesWritten = 0;

  for (const buffer of buffers) {
    fs.writeSync(fileDescriptor, buffer, 0, buffer.length);
    bytesWritten += buffer.length;
  }

  return bytesWritten;
}

function calculateFileCrc32(absolutePath: string): number {
  const fileDescriptor = fs.openSync(absolutePath, "r");
  const chunk = Buffer.alloc(1024 * 1024);
  let crc = 0xffffffff;

  try {
    while (true) {
      const bytesRead = fs.readSync(fileDescriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) {
        break;
      }

      for (let index = 0; index < bytesRead; index += 1) {
        crc = CRC32_TABLE[(crc ^ chunk[index]) & 0xff] ^ (crc >>> 8);
      }
    }
  } finally {
    fs.closeSync(fileDescriptor);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function calculateBufferCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): number[] {
  const table: number[] = [];

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[index] = crc >>> 0;
  }

  return table;
}

function normalizeArchivePath(archivePath: string, isDirectory: boolean): string {
  const normalized = archivePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  const withoutTrailingSlash = normalized.replace(/\/+$/, "");

  if (!withoutTrailingSlash || withoutTrailingSlash.includes("../")) {
    throw new Error(`Invalid ZIP archive path: ${archivePath}`);
  }

  return isDirectory ? `${withoutTrailingSlash}/` : withoutTrailingSlash;
}

function ensureZipExtension(outputPath: string): string {
  return outputPath.toLowerCase().endsWith(".zip") ? outputPath : `${outputPath}.zip`;
}

function assertZipPathLength(fileName: Buffer, archivePath: string): void {
  if (fileName.length > UINT16_MAX) {
    throw new Error(`ZIP archive path is too long: ${archivePath}`);
  }
}

function assertZipOffset(value: number): void {
  if (value > UINT32_MAX) {
    throw new Error("Backup is too large for this simple ZIP writer.");
  }
}

function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  };
}
