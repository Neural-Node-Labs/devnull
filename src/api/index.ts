#!/usr/bin/env node
/**
 * API server entry point for Docker deployment.
 *
 * This file is the container's CMD target. It loads environment variables,
 * initializes the database, and starts the HTTP API server.
 *
 * Usage:
 *   node dist/api/index.js
 */

import { initializeDatabase } from "../db/initialize.js";
import { startApiServer } from "./server.js";

async function main() {
  // Initialize the database (creates tables if they don't exist)
  console.log("[Entry] Initializing database...");
  try {
    const db = await initializeDatabase();
    console.log("[Entry] Database initialized successfully.");
    // Note: db is not passed to startApiServer because the API routes
    // create their own store instances. The db is initialized here to
    // ensure tables exist before any request arrives.
  } catch (err) {
    console.error("[Entry] Database initialization failed:", err instanceof Error ? err.message : String(err));
    console.error("[Entry] Continuing without database — some features may be unavailable.");
  }

  // Start the API server
  console.log("[Entry] Starting API server...");
  startApiServer();
}

main().catch((err) => {
  console.error("[Entry] Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
