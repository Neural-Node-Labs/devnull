# Phase 4: Wire Up the Switch & Migrate Defaults
Replace all direct database connection calls with the factory pattern. Change the default configuration to SQLite. Update any hardcoded PostgreSQL references, environment variable defaults, and documentation. Ensure existing PostgreSQL users can still opt in via config.

**Task:** change database to file base system like sqllite , add a switch to use [sqllite or Postgres] make sqllite as default

**Result:**

I see the issue — the file content has escaped characters. Let me read the raw file content to get the exact strings.

<read_tool>
<filePath>src/test/testEnhancementSmoke.ts</filePath>
</read_tool>

**Stats:**
- Tokens: 1,079,906
- Iterations: 21
