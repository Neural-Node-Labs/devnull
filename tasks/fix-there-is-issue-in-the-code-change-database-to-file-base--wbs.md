# WBS: FIX, There is issue in the code -->change database to file base system like sqllite , add a switch to use [sqllite or Postgres] make sqllite as default

- [x] Phase 1: Architecture & Configuration Design
Analyze the current database layer, design the abstraction interface, and define the configuration schema for switching between SQLite and PostgreSQL. This phase produces the blueprint and solution design documents.
- [x] Phase 2: Database Abstraction Layer Implementation
Implement the core abstraction layer — a database interface/contract that both SQLite and PostgreSQL drivers implement. This includes connection management, session handling, and migration support. No existing code is modified yet.
- [x] Phase 3: SQLite Driver Implementation
Implement the SQLite-specific driver using the abstraction layer. This includes SQLite-specific connection setup, query syntax adjustments (if any), and migration scripts. Make SQLite the default driver.
- [x] Phase 4: PostgreSQL Driver Refactoring
Refactor the existing PostgreSQL code to conform to the new abstraction interface. Ensure backward compatibility and that the PostgreSQL path continues to work identically when selected.
- [x] Phase 5: Integration, Testing & Validation
Wire everything together with the configuration switch, update all call sites to use the abstraction layer, run the full test suite against both database backends, and validate that the default (SQLite) path works correctly.
