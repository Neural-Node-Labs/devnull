import fs from "node:fs";
import path from "node:path";
import { globTool } from "../tools/globTool.js";
import { loadIgnoreRules } from "./ignoreRules.js";
import { IndexEntry, IndexFile } from "../core/types.js";

const MAX_DUMP_BYTES = 450 * 1024; // 450KB soft ceiling — stay well under 500KB limit
const INDEX_DIR = ".agent/index";

/**
 * Walks the workspace (respecting .agentignore/.gitignore/.dockerignore), and dumps every
 * file's content into chunked index00x.dump files, each marked so the original file can be
 * reconstructed, while index.json tracks filename -> (dump file, start line, end line).
 */
export async function buildIndex(cwd: string = process.cwd(), force: boolean = true): Promise<IndexFile> {
  const indexDirAbs = path.join(cwd, INDEX_DIR);
  fs.mkdirSync(indexDirAbs, { recursive: true });

  // Staleness check: if not forced and index is fresh, return cached
  if (!force && !isIndexStale(cwd)) {
    const cached = getCachedIndex(cwd);
    if (cached) return cached;
  }

  // fresh rebuild: clear old dump files
  for (const f of fs.readdirSync(indexDirAbs)) {
    if (f.startsWith("index") && f.endsWith(".dump")) fs.unlinkSync(path.join(indexDirAbs, f));
  }

  loadIgnoreRules(cwd); // ensures ignore file merging happens even if globTool caches later
  const files = await globTool("**/*", cwd);

  const entries: IndexEntry[] = [];
  let dumpIndex = 1;
  let currentDumpPath = path.join(indexDirAbs, dumpFileName(dumpIndex));
  let currentDumpSize = 0;
  let currentLine = 1;
  let currentStream = fs.createWriteStream(currentDumpPath, { flags: "w" });

  for (const relPath of files) {
    const abs = path.join(cwd, relPath);
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf-8");
    } catch {
      continue; // skip binary/unreadable files
    }

    const marker = `>>> FILE: ${relPath} >>>\n`;
    const endMarker = `<<< END: ${relPath} <<<\n`;
    const block = marker + content + (content.endsWith("\n") ? "" : "\n") + endMarker;
    const blockBytes = Buffer.byteLength(block, "utf-8");

    // roll to a new dump file if this block would exceed the cap
    if (currentDumpSize + blockBytes > MAX_DUMP_BYTES && currentDumpSize > 0) {
      currentStream.end();
      dumpIndex += 1;
      currentDumpPath = path.join(indexDirAbs, dumpFileName(dumpIndex));
      currentStream = fs.createWriteStream(currentDumpPath, { flags: "w" });
      currentDumpSize = 0;
      currentLine = 1;
    }

    const startLine = currentLine + 1; // +1 to skip the marker line
    currentStream.write(block);
    const linesInBlock = block.split("\n").length - 1;
    currentLine += linesInBlock;
    currentDumpSize += blockBytes;
    const endLine = currentLine - 1; // exclude the end-marker line

    const now = new Date().toISOString();
    entries.push({
      filename: path.basename(relPath),
      filepath: relPath,
      fileVersion: hashContent(content),
      dumpFile: dumpFileName(dumpIndex),
      startLine,
      endLine,
      lastIndexed: now,
    });
  }
  currentStream.end();

  const now = new Date().toISOString();
  const indexFile: IndexFile = { generatedAt: now, lastIndexed: now, entries };
  fs.writeFileSync(path.join(indexDirAbs, "index.json"), JSON.stringify(indexFile, null, 2), "utf-8");
  return indexFile;
}

/** Reads a specific file's content back out of the dump, using index.json coordinates. */
export function readFromIndex(filepath: string, cwd: string = process.cwd()): string | undefined {
  const indexPath = path.join(cwd, INDEX_DIR, "index.json");
  if (!fs.existsSync(indexPath)) return undefined;

  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as IndexFile;
  const entry = index.entries.find((e) => e.filepath === filepath);
  if (!entry) return undefined;

  const dumpPath = path.join(cwd, INDEX_DIR, entry.dumpFile);
  const lines = fs.readFileSync(dumpPath, "utf-8").split("\n");
  return lines.slice(entry.startLine - 1, entry.endLine).join("\n");
}

/**
 * Returns the cached index if it exists and is fresh (no files changed since last index).
 * Returns undefined if no index exists.
 */
export function getCachedIndex(cwd: string = process.cwd()): IndexFile | undefined {
  const indexPath = path.join(cwd, INDEX_DIR, "index.json");
  if (!fs.existsSync(indexPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf-8")) as IndexFile;
  } catch {
    return undefined;
  }
}

/**
 * Checks whether the cached index is stale by comparing file hashes.
 * Returns true if:
 *  - No index exists
 *  - Any indexed file has changed (hash mismatch)
 *  - The index is older than 5 minutes (configurable via staleThresholdMs)
 * Returns false if the index is still fresh.
 */
export function isIndexStale(cwd: string = process.cwd(), staleThresholdMs: number = 5 * 60 * 1000): boolean {
  const indexPath = path.join(cwd, INDEX_DIR, "index.json");
  if (!fs.existsSync(indexPath)) return true;

  let index: IndexFile;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as IndexFile;
  } catch {
    return true;
  }

  // Check time-based staleness first
  if (index.lastIndexed) {
    const elapsed = Date.now() - new Date(index.lastIndexed).getTime();
    if (elapsed < staleThresholdMs) {
      // Index is recent enough — check if any files actually changed
      for (const entry of index.entries) {
        const absPath = path.join(cwd, entry.filepath);
        let content: string;
        try {
          content = fs.readFileSync(absPath, "utf-8");
        } catch {
          return true; // file was deleted or is unreadable
        }
        if (hashContent(content) !== entry.fileVersion) {
          return true; // file content changed
        }
      }
      return false; // all files match, index is fresh
    }
  }

  return true; // no lastIndexed or exceeded threshold
}

function dumpFileName(n: number): string {
  return `index${String(n).padStart(3, "0")}.dump`;
}

function hashContent(content: string): string {
  // lightweight content fingerprint, not cryptographic â€” good enough for change detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 31 + content.charCodeAt(i)) | 0;
  }
  return `v${(hash >>> 0).toString(16)}`;
}

