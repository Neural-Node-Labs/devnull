import fs from "node:fs";
import path from "node:path";
import { buildIndex, getCachedIndex, isIndexStale, readFromIndex } from "../indexing/indexer.js";
import { IndexFile } from "../core/types.js";

const INDEX_DIR = ".agent/index";

export interface IndexingResult {
  entriesCount: number;
  generatedAt: string;
  lastIndexed: string;
  indexFile: IndexFile;
}

/**
 * Rebuild the workspace index (.agent/index/index.json + dump files).
 * Returns a summary of what was indexed.
 */
export async function rebuildIndex(cwd: string = process.cwd(), force: boolean = true): Promise<IndexingResult> {
  const indexFile = await buildIndex(cwd, force);
  return {
    entriesCount: indexFile.entries.length,
    generatedAt: indexFile.generatedAt,
    lastIndexed: indexFile.lastIndexed,
    indexFile,
  };
}

/**
 * Read a specific file's content back from the index dump files.
 * Returns undefined if the file is not in the index.
 */
export function readIndexedFile(filepath: string, cwd: string = process.cwd()): string | undefined {
  return readFromIndex(filepath, cwd);
}

/**
 * Estimate the total byte size of all dump files in the index directory.
 * Used to calculate token savings when using the cached index vs. a naive full scan.
 */
function estimateDumpSize(cwd: string): number {
  const indexDirAbs = path.join(cwd, INDEX_DIR);
  try {
    const files = fs.readdirSync(indexDirAbs);
    let total = 0;
    for (const f of files) {
      if (f.startsWith("index") && f.endsWith(".dump")) {
        total += fs.statSync(path.join(indexDirAbs, f)).size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Log an estimated token-savings metric to console.
 * Compares the size of reading index.json vs. reading all dump files (naive full scan).
 * At ~1 token per 4 bytes (rough heuristic), this gives a ballpark savings figure.
 */
function logTokenSavings(cwd: string): void {
  const indexPath = path.join(cwd, INDEX_DIR, "index.json");
  let indexSize = 0;
  try {
    indexSize = fs.statSync(indexPath).size;
  } catch {
    // index.json doesn't exist yet — nothing to log
    return;
  }

  const dumpSize = estimateDumpSize(cwd);
  const naiveTokens = Math.round(dumpSize / 4);
  const actualTokens = Math.round(indexSize / 4);
  const savedTokens = naiveTokens - actualTokens;
  const savingsRatio = dumpSize > 0 && indexSize > 0 ? (dumpSize / indexSize).toFixed(1) : "?";

  console.log(
    `[index] Cached index resolved: ~${actualTokens.toLocaleString()} tokens read ` +
    `(vs. ~${naiveTokens.toLocaleString()} for naive full scan — ` +
    `${savingsRatio}x savings, ~${savedTokens.toLocaleString()} tokens saved)`
  );
}

/**
 * Get the cached index without re-scanning the workspace.
 * Returns undefined if no index exists or the index is stale.
 * Use this for index-first resolution — consult the index before walking directories.
 *
 * Self-check: if the index is missing or stale, emits a warning before falling back
 * to a full scan so the caller knows a more expensive operation is about to happen.
 */
export function getIndex(cwd: string = process.cwd()): IndexFile | undefined {
  if (isIndexStale(cwd)) {
    const indexPath = path.join(cwd, INDEX_DIR, "index.json");
    if (!fs.existsSync(indexPath)) {
      console.warn("[index] WARNING: No index found at .agent/index/index.json — falling back to full workspace scan. This is 10-100x more expensive. Run indexing_tool (action='rebuild') to create the index.");
    } else {
      console.warn("[index] WARNING: Index is stale (files have changed since last index) — falling back to full workspace scan. Run indexing_tool (action='rebuild') to refresh the index.");
    }
    return undefined;
  }

  const cached = getCachedIndex(cwd);
  if (cached) {
    logTokenSavings(cwd);
  }
  return cached;
}
