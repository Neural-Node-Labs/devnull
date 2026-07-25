# Index-First Resolution Protocol

## Why This Matters

Every time the LLM needs to understand the workspace file structure, it has two options:

| Approach | What's Read | Typical Size | ~Token Cost |
|----------|------------|-------------|-------------|
| **Index-first** | `index.json` only | ~36 KB | ~9,000 tokens |
| **Naive full scan** | All `.dump` files | ~18 MB | ~4,5M tokens |

**Savings: 10–100× in token consumption.** The index is ~500× smaller than the raw dump files.

At DeepSeek pricing (~$0.14/M input tokens for cache hits), a single naive scan costs ~$0.63 vs. ~$0.0013 for an index read. Over dozens of scans per session, this adds up to real cost and context-window waste.

## The Pattern

### Mandatory Rule

> **Always call `getIndex(cwd)` before falling back to a full workspace scan.**

```typescript
import { getIndex } from "../indexing/indexer.js";

// ✅ CORRECT: Index-first
const index = getIndex(cwd);
if (index) {
  // Use index.entries for file listing — cheap, ~9K tokens
} else {
  // Fall back to full scan — expensive, ~4.5M tokens
  // The getIndex() function already logged a warning explaining why
}
```

### What `getIndex()` Does

1. **Checks staleness** via `isIndexStale()` — compares file hashes and a time threshold (5 min default).
2. **Returns the cached `IndexFile`** if fresh — zero filesystem walking.
3. **Logs token savings** — e.g. `[index] Cached index resolved: ~9K tokens read (vs. ~4.5M for naive full scan — 500x savings, ~4.49M tokens saved)`.
4. **Warns on miss** — if no index exists or it's stale, emits a clear warning telling the caller to run `indexing_tool (action='rebuild')`.

### What to Avoid

```typescript
// ❌ WRONG: Naive full scan without checking index first
const files = await globTool("**/*", cwd);

// ❌ WRONG: Manual recursive directory walk
function walkDir(dir: string): string[] {
  const entries = fs.readdirSync(dir);
  // ... recursive walk ...
}
```

## Token Math

The `.agent/index/` directory contains:

| File | Purpose | Typical Size |
|------|---------|-------------|
| `index.json` | File listing with coordinates | ~36 KB |
| `index001.dump` | File contents (chunk 1) | ~450 KB |
| `index002.dump` | File contents (chunk 2) | ~450 KB |
| ... | ... | ... |
| `index00N.dump` | File contents (chunk N) | ~450 KB |

**Total dump size:** ~18 MB for a typical workspace with 150+ files.

**Token estimation** (rough heuristic: ~1 token per 4 bytes):
- `index.json`: 36,000 bytes ÷ 4 = ~9,000 tokens
- All dump files: 18,000,000 bytes ÷ 4 = ~4,500,000 tokens
- **Savings ratio:** 500× (two orders of magnitude)

## How to Verify Compliance

### Automated CI Gate

A CI gate script exists at `scripts/check-index-first.sh`. It scans TypeScript source files for:

1. **Naive recursive glob patterns** — `globTool("**/*"` or `globTool('**/*'`
2. **Manual directory walks** — `readdirSync` + `.filter`/`.map`/`.forEach`/`.flatMap`

If a file uses any of these patterns **without** also importing or calling `getIndex()`, the script fails with exit code 1.

**Run locally:**
```bash
bash scripts/check-index-first.sh          # scan all src/ files
bash scripts/check-index-first.sh --diff    # scan only changed files
```

### Manual Review Checklist

- [ ] Does the file import `getIndex` from `../indexing/indexer.js`?
- [ ] Is `getIndex(cwd)` called **before** any `globTool("**/*"` or recursive directory walk?
- [ ] Does the fallback path (when index is missing/stale) log a warning?
- [ ] Are test files excluded from the CI gate? (Test files may legitimately test the scan functions.)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Call Site                       │
│  (skill file, tool, orchestration script)        │
│                                                  │
│  1. const index = getIndex(cwd);                 │
│  2. if (index) { use index.entries }             │
│  3. else { fallback to full scan }               │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              getIndex()                          │
│  src/tools/indexingTool.ts                      │
│                                                  │
│  • Calls isIndexStale()                          │
│  • Logs token savings or warning                 │
│  • Returns IndexFile | undefined                 │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│              isIndexStale()                      │
│  src/indexing/indexer.ts                        │
│                                                  │
│  • Checks if index.json exists                   │
│  • Compares file hashes (hashContent)            │
│  • Checks time threshold (5 min default)         │
│  • Returns boolean                               │
└─────────────────────────────────────────────────┘
```

## Related Files

| File | Purpose |
|------|---------|
| `src/indexing/indexer.ts` | Core indexing logic: `buildIndex()`, `isIndexStale()`, `getCachedIndex()`, `readFromIndex()` |
| `src/tools/indexingTool.ts` | Tool interface: `getIndex()`, `rebuildIndex()`, `readIndexedFile()` |
| `src/core/types.ts` | `IndexFile` and `IndexEntry` type definitions |
| `scripts/check-index-first.sh` | CI gate script enforcing the pattern |
| `src/indexing/__tests__/indexing.test.ts` | Unit tests for staleness, caching, and accuracy |
| `tasks/lessons.md` | Captured lesson: "Always read index.json first" |

## History

- **2026-07-24:** Pattern identified during Phase 1 audit of indexing usage. Token waste quantified at ~4.5M tokens per naive scan.
- **2026-07-24:** `getIndex()` implemented as mandatory entry point in `src/tools/indexingTool.ts`.
- **2026-07-24:** All call sites updated to use index-first pattern (Phase 3).
- **2026-07-24:** Test suite and CI gate created (Phase 4).
- **2026-07-24:** This documentation written (Phase 5).
