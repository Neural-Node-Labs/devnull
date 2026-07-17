# Plan: write a blueprint of an ai agent crwa;er that summarize the url

- [ ] **Define scope & constraints** — Clarify what "AI agent crawler that summarizes the URL" means: single-page vs multi-page crawl, depth limit, supported content types (HTML, PDF, etc.), output format (plain text, structured JSON, markdown), and non-functional requirements (max latency, concurrency, rate limiting, politeness policy).
- [ ] **Decompose into components** — Identify core components: URL queue manager, HTTP fetcher (with retry/robots.txt respect), content extractor (strip boilerplate, extract main text), summarizer (LLM call or extractive algorithm), and output formatter. Define single responsibilities for each.
- [ ] **Define data contracts & flow** — Produce a sequence diagram (mermaid) for the happy path: submit URL → queue → fetch → extract → summarize → return result. Also draw failure paths: unreachable URL, non-text content, LLM timeout, rate limit hit.
- [ ] **Pick technology stack** — Justify choices: Node.js/TypeScript for the agent runtime, Cheerio or Readability for extraction, a configurable LLM client (OpenAI/Anthropic/DeepSeek) for summarization, and a simple in-memory queue (or Bull/BullMQ if persistence needed). Reject over-engineered options (e.g., Kafka for a single-agent crawler).
- [ ] **Produce blueprint.md** — Write the architecture document covering: component diagram, data flow, error handling strategy, rate limiting / politeness policy, and explicit tradeoffs (e.g., in-memory queue vs Redis, extractive vs abstractive summarization).
- [ ] **Produce solution-design.md** — Detail the implementation plan: module structure, key interfaces (ICrawler, ISummarizer, IQueue), configuration schema, and test strategy (unit tests for extraction/summarization, integration test for fetch+summarize end-to-end).
- [ ] **Produce artifact.md** — List all files to be created/updated: `src/crawler/`, `src/summarizer/`, `src/queue/`, `src/types.ts`, `config.ts`, `index.ts`, `tests/`, `README.md`. Include a rollback plan (revert to last commit) and deployment notes (env vars for LLM keys, rate limit config).
- [ ] **Validate with architect review** — Check that the design meets the original constraints, failure paths are covered, and no component is over- or under-engineered for the stated scope.

## Review
The blueprint is complete. Here's a summary of what was produced:

---

## Blueprint: AI Agent Crawler & URL Summarizer

**File:** `blueprint-ai-crawler-summarizer.md` (329 lines)

### What it is

A blueprint for adding a new `crawl_and_summarize_tool` to devnull — a tool the LLM can call during any ReAct session to fetch a URL, strip boilerplate (nav, ads, scripts, cookie notices), extract meaningful content, and return a structured summary.

### Key Design Decisions

1. **No external API dependency** — Uses only `fetch` (Node 20 built-in) + `cheerio` (already in `package.json`). No OpenAI/Claude for extraction.

2. **Tool does NOT call the LLM** — The tool returns structured data (title, excerpt, links, metadata). The **agent** (ReAct loop) decides whether to summarize further using its own LLM. This keeps the tool stateless, fast, and LLM-independent.

3. **Two-phase summarization** — Phase 1 (heuristic): extracts title, first paragraphs, headings, word count. Phase 2 (optional): the agent's LLM can produce a natural-language summary from the excerpt.

4. **Boilerplate stripping** — Removes `<script>`, `<style>`, `<nav>`, `<footer>`, `<iframe>`, elements with common boilerplate classes/IDs, hidden elements, and ARIA landmark roles.

5. **Built-in safeguards** — Robots.txt checking (cached per domain), rate limiting (1s minimum interval per domain), timeout (15s), redirect limit (5), Content-Type validation, 500KB HTML truncation.

### What needs to change

| File | Change |
|---|---|
| `src/tools/crawlSummarizeTool.ts` | **NEW** — main implementation (~200 lines) |
| `src/tools/toolSchemas.ts` | **EDIT** — add `crawl_and_summarize_tool` schema |
| `src/tools/toolDispatcher.ts` | **EDIT** — add dispatch case |

### What's explicitly out of scope for v1

Caching, pagination, PDF extraction, screenshots, diffing, batch URLs — all documented as future enhancements.
