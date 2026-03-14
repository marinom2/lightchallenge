/**
 * db/seed_identity.ts
 *
 * One-shot migration: load every binding from the legacy
 * offchain/.state/identity_bindings.json into public.identity_bindings.
 *
 * Safe to re-run: upserts on (wallet, platform) unique constraint.
 *
 * Usage:
 *   npx tsx db/seed_identity.ts
 */

import path from "path";
import fs   from "fs/promises";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../webapp/.env.local") });

import { getPool, closePool } from "../offchain/db/pool";

type LegacyBinding = {
  wallet:     string;
  platform:   string;
  platformId: string;
  handle?:    string;
  signedBy?:  string;
  signature?: string;
  ts?:        number;
};

async function main() {
  const jsonPath = path.resolve(__dirname, "../offchain/.state/identity_bindings.json");

  let raw: string;
  try {
    raw = await fs.readFile(jsonPath, "utf8");
  } catch {
    console.log("No identity_bindings.json found — nothing to seed.");
    return;
  }

  const bindings: LegacyBinding[] = JSON.parse(raw);
  if (!bindings.length) {
    console.log("File is empty — nothing to seed.");
    return;
  }

  const pool = getPool();
  let seeded = 0;

  for (const b of bindings) {
    const wallet    = (b.wallet || "").toLowerCase();
    const platform  = b.platform || "steam";
    const platformId = b.platformId || "";
    const handle    = b.handle ?? null;
    const signedBy  = b.signedBy ?? null;
    const signature = b.signature ?? null;
    const ts        = typeof b.ts === "number" ? b.ts : Date.now();

    if (!wallet || !platformId) {
      console.warn("Skipping incomplete binding:", b);
      continue;
    }

    await pool.query(
      `insert into public.identity_bindings
         (wallet, platform, platform_id, handle, signed_by, signature, ts)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict on constraint identity_bindings_wallet_platform_uq
       do update set
         platform_id = excluded.platform_id,
         handle      = coalesce(excluded.handle, public.identity_bindings.handle),
         signed_by   = excluded.signed_by,
         signature   = excluded.signature,
         ts          = excluded.ts,
         updated_at  = now()`,
      [wallet, platform, platformId, handle, signedBy, signature, ts],
    );

    console.log(`  seeded: ${wallet} / ${platform} / ${platformId}${handle ? ` (${handle})` : ""}`);
    seeded++;
  }

  console.log(`\nDone. ${seeded}/${bindings.length} binding(s) upserted.`);
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
