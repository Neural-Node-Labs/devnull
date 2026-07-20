# WBS: change database to file base system like sqllite , add a switch to use [sqllite or Postgres] make sqllite as default

- [ ] Phase 1: Analyze Current Database Layer
Map all database interactions in the codebase — identify the ORM, connection management, migration system, and all repository/query files that interact with the database. Document the schema definitions and any environment configuration that controls database selection.
- [ ] Phase 2: Define Abstraction Interface
Design and implement a database abstraction layer (e.g., `DatabaseBackend` interface/abstract class) that both SQLite and PostgreSQL drivers can implement. Define the common methods (connect, disconnect, execute, query, migrate, transaction) and create the configuration switch (default: SQLite) with environment variable or config file support.
- [ ] Phase 3: Implement SQLite Backend
Build the SQLite backend using the abstraction interface. Set up the SQLite connection, file-based storage path, schema initialization, and migration logic. Ensure all existing queries and operations work identically against SQLite. Update the default configuration to point to SQLite.
- [ ] Phase 4: Implement PostgreSQL Backend (Optional Path)
Implement the PostgreSQL backend using the same abstraction interface. Ensure the switch between SQLite and PostgreSQL is seamless — only the configuration value changes. Verify that both backends produce identical behavior for all database operations.
- [ ] Phase 5: Integration Testing & Verification
Write integration tests that run against both backends (SQLite default, PostgreSQL optional). Verify that the switch works at startup, that all CRUD operations succeed on both, and that migrations run correctly on each. Update documentation and configuration examples to reflect the new default (SQLite) and the switch mechanism.
