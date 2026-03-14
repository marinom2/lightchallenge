/**
 * offchain/db/pool.ts
 *
 * Shared pg.Pool singleton for all offchain DB service modules.
 *
 * Callers must ensure dotenv is loaded (DATABASE_URL in env) before the
 * first call to getPool(). All existing offchain entry points already do
 * this via `dotenv.config({ path: ... })` at their top level.
 *
 * Long-running processes (dispatcher, worker, indexer) can call getPool()
 * freely — the pool is created once and reused.
 *
 * One-shot scripts should call closePool() before process.exit() to allow
 * the pg connection to drain cleanly.
 */

import { Pool } from "pg";
import { sslConfig } from "./sslConfig";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[offchain/db/pool] DATABASE_URL is not set. " +
        "Load dotenv before calling getPool()."
    );
  }

  _pool = new Pool({
    connectionString: url,
    ssl: sslConfig(),
    max: 10,
  });

  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
