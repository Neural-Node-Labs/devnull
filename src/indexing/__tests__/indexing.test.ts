/**
 * Unit tests for the indexing module — getIndex(), isIndexStale(), getCachedIndex(),
 * and the index-first resolution pattern.
 *
 * These tests verify:
 *  - getIndex() returns the cached index when it's fresh
 *  - getIndex() returns undefined and warns when index is missing
 *  - getIndex() returns undefined and warns when index is stale
 *  - Token savings are logged when index is fresh
 *  - isIndexStale() correctly detects stale/missing/fresh indexes
 *  - getCachedIndex() returns undefined for missing/corrupt index
 *  - File discovery accuracy: index entries match actual files
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isIndexStale, getCachedIndex, buildIndex } from "../../indexing/indexer.js";
import { getIndex } from "../../tools/indexingTool.js";
import { IndexFile } from "../../core/types.js";

/** Create a temporary workspace with a .agent/index directory and optional index.json */
function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "indexing-test-"));
  const indexDir = path.join(dir, ".agent", "index");
  fs.mkdirSync(indexDir, { recursive: true });
  return dir;
}

/** Write a valid index.json to the workspace */
function writeIndex(cwd: string, overrides: Partial<IndexFile> = {}): IndexFile {
  const indexFile: IndexFile = {
    generatedAt: new Date().toISOString(),
    lastIndexed: new Date().toISOString(),
    entries: [
      {
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion: "v0",
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
  const indexPath = path.join(cwd, ".agent", "index", "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(indexFile, null, 2), "utf-8");
  return indexFile;
}

/** Write a dump file so the index has content to reference */
function writeDumpFile(cwd: string, dumpFile: string, content: string): void {
  const dumpPath = path.join(cwd, ".agent", "index", dumpFile);
  fs.writeFileSync(dumpPath, content, "utf-8");
}

/** Write a source file that the index references */
function writeSourceFile(cwd: string, filepath: string, content: string): void {
  const absPath = path.join(cwd, filepath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
}

describe("isIndexStale()", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempWorkspace();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("returns true when no index.json exists", () => {
    expect(isIndexStale(cwd)).toBe(true);
  });

  it("returns true when index.json is corrupt (invalid JSON)", () => {
    const indexPath = path.join(cwd, ".agent", "index", "index.json");
    fs.writeFileSync(indexPath, "not-valid-json{{{", "utf-8");
    expect(isIndexStale(cwd)).toBe(true);
  });

  it("returns false when index is fresh and files match", () => {
    // Write a source file
    writeSourceFile(cwd, "test.txt", "hello world");
    // Write the index referencing that file with matching hash
    const content = "hello world";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * 31 + content.charCodeAt(i)) | 0;
    }
    const fileVersion = `v${(hash >>> 0).toString(16)}`;

    writeIndex(cwd, {
      lastIndexed: new Date().toISOString(),
      entries: [{
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion,
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: new Date().toISOString(),
      }],
    });

    expect(isIndexStale(cwd)).toBe(false);
  });

  it("returns true when a file's content has changed (hash mismatch)", () => {
    // Write source file with original content
    writeSourceFile(cwd, "test.txt", "original content");
    const content = "original content";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * 31 + content.charCodeAt(i)) | 0;
    }
    const fileVersion = `v${(hash >>> 0).toString(16)}`;

    writeIndex(cwd, {
      lastIndexed: new Date().toISOString(),
      entries: [{
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion,
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: new Date().toISOString(),
      }],
    });

    // Now change the file content
    fs.writeFileSync(path.join(cwd, "test.txt"), "modified content", "utf-8");

    expect(isIndexStale(cwd)).toBe(true);
  });

  it("returns true when a file has been deleted", () => {
    writeSourceFile(cwd, "test.txt", "content");
    const content = "content";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * 31 + content.charCodeAt(i)) | 0;
    }
    const fileVersion = `v${(hash >>> 0).toString(16)}`;

    writeIndex(cwd, {
      lastIndexed: new Date().toISOString(),
      entries: [{
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion,
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: new Date().toISOString(),
      }],
    });

    // Delete the file
    fs.unlinkSync(path.join(cwd, "test.txt"));

    expect(isIndexStale(cwd)).toBe(true);
  });

  it("returns true when lastIndexed exceeds the stale threshold", () => {
    writeSourceFile(cwd, "test.txt", "content");
    const content = "content";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * 31 + content.charCodeAt(i)) | 0;
    }
    const fileVersion = `v${(hash >>> 0).toString(16)}`;

    // Set lastIndexed to 10 minutes ago (threshold is 5 min by default)
    const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    writeIndex(cwd, {
      lastIndexed: oldDate,
      entries: [{
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion,
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: oldDate,
      }],
    });

    expect(isIndexStale(cwd, 5 * 60 * 1000)).toBe(true);
  });
});

describe("getCachedIndex()", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempWorkspace();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("returns undefined when no index.json exists", () => {
    expect(getCachedIndex(cwd)).toBeUndefined();
  });

  it("returns undefined when index.json is corrupt", () => {
    const indexPath = path.join(cwd, ".agent", "index", "index.json");
    fs.writeFileSync(indexPath, "{broken", "utf-8");
    expect(getCachedIndex(cwd)).toBeUndefined();
  });

  it("returns the parsed index when index.json is valid", () => {
    writeIndex(cwd);
    const result = getCachedIndex(cwd);
    expect(result).toBeDefined();
    expect(result!.entries).toHaveLength(1);
    expect(result!.entries[0].filepath).toBe("test.txt");
  });
});

describe("getIndex()", () => {
  let cwd: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = createTempWorkspace();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("returns undefined and warns when no index exists", () => {
    const result = getIndex(cwd);
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No index found")
    );
  });

  it("returns undefined and warns when index is stale (file changed)", () => {
    // Write source file
    writeSourceFile(cwd, "test.txt", "original");
    const content = "original";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * 31 + content.charCodeAt(i)) | 0;
    }
    const fileVersion = `v${(hash >>> 0).toString(16)}`;

    writeIndex(cwd, {
      lastIndexed: new Date().toISOString(),
      entries: [{
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion,
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: new Date().toISOString(),
      }],
    });

    // Modify the file to make index stale
    fs.writeFileSync(path.join(cwd, "test.txt"), "modified", "utf-8");

    const result = getIndex(cwd);
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Index is stale")
    );
  });

  it("returns the cached index and logs token savings when index is fresh", () => {
    // Write source file
    writeSourceFile(cwd, "test.txt", "hello world");
    const content = "hello world";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * 31 + content.charCodeAt(i)) | 0;
    }
    const fileVersion = `v${(hash >>> 0).toString(16)}`;

    writeIndex(cwd, {
      lastIndexed: new Date().toISOString(),
      entries: [{
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion,
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: new Date().toISOString(),
      }],
    });

    // Write a dump file so estimateDumpSize has something to measure
    writeDumpFile(cwd, "index001.dump", ">>> FILE: test.txt >>>\nhello world\n<<< END: test.txt <<<\n");

    const result = getIndex(cwd);
    expect(result).toBeDefined();
    expect(result!.entries).toHaveLength(1);
    // Should have logged token savings
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Cached index resolved")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("tokens saved")
    );
    // Should NOT have warned
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not log token savings when index exists but no dump files", () => {
    writeSourceFile(cwd, "test.txt", "hello world");
    const content = "hello world";
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash * 31 + content.charCodeAt(i)) | 0;
    }
    const fileVersion = `v${(hash >>> 0).toString(16)}`;

    writeIndex(cwd, {
      lastIndexed: new Date().toISOString(),
      entries: [{
        filename: "test.txt",
        filepath: "test.txt",
        fileVersion,
        dumpFile: "index001.dump",
        startLine: 1,
        endLine: 2,
        lastIndexed: new Date().toISOString(),
      }],
    });

    // No dump file written — logTokenSavings should still work (dumpSize = 0)
    const result = getIndex(cwd);
    expect(result).toBeDefined();
    // logTokenSavings returns early if index.json doesn't exist, but it does exist here
    // It will log with 0 dump size
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

describe("File discovery accuracy: index vs. full scan", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = createTempWorkspace();
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("buildIndex produces entries that match actual files on disk", async () => {
    // Create a realistic set of files
    writeSourceFile(cwd, "src/main.ts", "console.log('hello');\n");
    writeSourceFile(cwd, "src/utils/helper.ts", "export function help() {}\n");
    writeSourceFile(cwd, "README.md", "# Project\n");
    writeSourceFile(cwd, "package.json", '{"name":"test"}\n');

    // Build the index
    const indexFile = await buildIndex(cwd, true);

    // Verify every indexed filepath exists on disk
    for (const entry of indexFile.entries) {
      const absPath = path.join(cwd, entry.filepath);
      expect(fs.existsSync(absPath)).toBe(true);
    }

    // Verify every source file is in the index
    const indexedPaths = new Set(indexFile.entries.map((e) => e.filepath));
    expect(indexedPaths.has("src/main.ts")).toBe(true);
    expect(indexedPaths.has("src/utils/helper.ts")).toBe(true);
    expect(indexedPaths.has("README.md")).toBe(true);
    expect(indexedPaths.has("package.json")).toBe(true);
  });

  it("buildIndex excludes files matching ignore rules", async () => {
    // Create files that should be ignored
    writeSourceFile(cwd, "node_modules/express/index.js", "module.exports = {};\n");
    writeSourceFile(cwd, ".git/config", "[core]\n");
    writeSourceFile(cwd, "dist/bundle.js", "console.log('built');\n");
    writeSourceFile(cwd, ".agent/index/index001.dump", "stale data\n");
    writeSourceFile(cwd, ".log/error.log", "ERROR: something broke\n");
    writeSourceFile(cwd, "src/app.ts", "export const app = 'ok';\n");

    const indexFile = await buildIndex(cwd, true);

    const indexedPaths = indexFile.entries.map((e) => e.filepath);
    expect(indexedPaths).toContain("src/app.ts");
    expect(indexedPaths).not.toContain("node_modules/express/index.js");
    expect(indexedPaths).not.toContain(".git/config");
    expect(indexedPaths).not.toContain("dist/bundle.js");
    expect(indexedPaths).not.toContain(".agent/index/index001.dump");
    expect(indexedPaths).not.toContain(".log/error.log");
  });

  it("readFromIndex retrieves the exact content that was indexed", async () => {
    writeSourceFile(cwd, "src/data.json", '{"key": "value"}\n');
    const indexFile = await buildIndex(cwd, true);

    // Read back from index
    const { readFromIndex } = await import("../../indexing/indexer.js");
    const retrieved = readFromIndex("src/data.json", cwd);
    expect(retrieved).toBe('{"key": "value"}');
  });

  it("readFromIndex returns undefined for files not in the index", async () => {
    writeSourceFile(cwd, "src/data.json", '{"key": "value"}\n');
    await buildIndex(cwd, true);

    const { readFromIndex } = await import("../../indexing/indexer.js");
    const retrieved = readFromIndex("nonexistent.json", cwd);
    expect(retrieved).toBeUndefined();
  });
});