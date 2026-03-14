/**
 * db/migrate.ts
 *
 * Idempotent migration runner.
 * Reads DATABASE_URL from webapp/.env.local (same as all offchain services).
 * Runs every .sql file in db/migrations/ in lexicographic order.
 * Already-applied migrations are tracked in a migrations table.
 *
 * Usage:
 *   tsx db/migrate.ts
 */

import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { Pool } from "pg";
import { sslConfig } from "../offchain/db/sslConfig";

dotenv.config({
  path: path.resolve(process.cwd(), "webapp/.env.local"),
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig(),
  max: 3,
});

const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

async function ensureMigrationsTable(client: Awaited<ReturnType<typeof pool.connect>>) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id          bigserial   PRIMARY KEY,
      filename    text        NOT NULL UNIQUE,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(
  client: Awaited<ReturnType<typeof pool.connect>>
): Promise<Set<string>> {
  const res = await client.query<{ filename: string }>(
    `SELECT filename FROM public.schema_migrations ORDER BY applied_at ASC`
  );
  return new Set(res.rows.map((r) => r.filename));
}

async function markApplied(
  client: Awaited<ReturnType<typeof pool.connect>>,
  filename: string
) {
  await client.query(
    `INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`,
    [filename]
  );
}

async function main() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("[migrate] no migration files found");
      return;
    }

    let ran = 0;

    for (const filename of files) {
      if (applied.has(filename)) {
        console.log(`[migrate] skip  ${filename} (already applied)`);
        continue;
      }

      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filepath, "utf8");

      console.log(`[migrate] apply ${filename} ...`);

      await client.query("BEGIN");

      try {
        await client.query(sql);
        await markApplied(client, filename);
        await client.query("COMMIT");
        console.log(`[migrate] done  ${filename}`);
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] FAILED ${filename}:`, err);
        process.exit(1);
      }
    }

    if (ran === 0) {
      console.log("[migrate] database is up to date");
    } else {
      console.log(`[migrate] applied ${ran} migration(s)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
