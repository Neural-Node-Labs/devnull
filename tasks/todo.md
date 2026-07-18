# Task: AI Agent for URL Crawling & Site Mapping

## Goal
Create a new tool (`crawl_site_mapper_tool`) that crawls a given URL, discovers all internal pages/routes, and builds a site map showing the page hierarchy and relationships.

## Plan

### 1. Create `src/tools/siteCrawlerTool.ts`
- New tool: `crawl_site_mapper_tool`
- Accepts: `url` (starting URL), `maxPages` (optional, default 50), `sameDomain` (optional, default true)
- Uses `cheerio` (already a dependency) to parse HTML
- BFS crawl: start from URL, extract all `<a href="...">` links
- Filter to same-domain internal links
- Track visited URLs to avoid cycles
- Build a site map: for each page, record its URL, title, links to other pages, and depth level
- Return structured site map data

### 2. Register in `src/tools/toolSchemas.ts`
- Add schema entry for `crawl_site_mapper_tool`

### 3. Register in `src/tools/toolDispatcher.ts`
- Add dispatch case for `crawl_site_mapper_tool`

### 4. Test
- Run a quick test against a known site to verify it works

## Review
- [x] Plan written
- [x] Tool implemented (`src/tools/siteCrawlerTool.ts`)
- [x] Schema registered (`src/tools/toolSchemas.ts`)
- [x] Dispatcher updated (`src/tools/toolDispatcher.ts`)
- [x] Tested — successfully crawled Hacker News (5 pages, tree hierarchy, link graph)
- [x] TypeScript compiles cleanly (`npx tsc --noEmit` passes)
