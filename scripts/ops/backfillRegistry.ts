/**
 * scripts/ops/backfillRegistry.ts
 *
 * Reconciles MetadataRegistry on-chain state with the DB.
 * Finds challenges where registry_status != 'success' and attempts ownerSet().
 *
 * Safe to run any number of times — ownerSet() is write-once; AlreadySet reverts
 * are treated as success (the URI is already on-chain).
 *
 * ENV:
 *   DATABASE_URL       = postgresql://...
 *   HARDHAT_NETWORK    = lightchain  (or omit for default)
 *   METADATA_REGISTRY  = 0x...       (optional; else from deployments)
 *   CHALLENGEPAY       = 0x...       (optional; else from deployments)
 *   BASE_URL           = https://...  (for building metadata URIs)
 *   DRY_RUN            = true         (optional; just report, don't write)
 *   BATCH_SIZE         = 50           (optional; max per run)
 */

import hre from "hardhat";
const { ethers } = hre;
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import { sslConfig } from "../../offchain/db/sslConfig";

function readDeploy(net: string, key: string): string | undefined {
  try {
    const p = path.join("deployments", `${net}.json`);
    const js = JSON.parse(fs.readFileSync(p, "utf8"));
    return js[key] || js[key[0].toLowerCase() + key.slice(1)];
  } catch {
    return undefined;
  }
}

async function main() {
  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const dryRun = (process.env.DRY_RUN || "").toLowerCase() === "true";
  const batchSize = Number(process.env.BATCH_SIZE) || 50;

  const registryAddr =
    process.env.METADATA_REGISTRY ||
    readDeploy(net, "MetadataRegistry");
  const cpAddr =
    process.env.CHALLENGEPAY ||
    readDeploy(net, "ChallengePay");
  const baseUrl = (process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");

  if (!registryAddr) throw new Error("MetadataRegistry address missing");
  if (!cpAddr) throw new Error("ChallengePay address missing");
  if (!baseUrl) throw new Error("BASE_URL required for building metadata URIs");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

  console.log(`
================================================================================
MetadataRegistry Backfill
================================================================================
Network         : ${net}
Registry        : ${registryAddr}
ChallengePay    : ${cpAddr}
Base URL        : ${baseUrl}
Dry run         : ${dryRun}
Batch size      : ${batchSize}
================================================================================
`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(),
  });

  // Find challenges that need registry writes
  const res = await pool.query<{
    id: string;
    registry_status: string | null;
    registry_error: string | null;
  }>(
    `SELECT id, registry_status, registry_error
     FROM public.challenges
     WHERE registry_status IS NULL
        OR registry_status IN ('pending', 'failed')
     ORDER BY id ASC
     LIMIT $1`,
    [batchSize]
  );

  console.log(`Found ${res.rows.length} challenges needing registry writes.\n`);

  if (res.rows.length === 0) {
    console.log("Nothing to do.");
    await pool.end();
    return;
  }

  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${await signer.getAddress()}\n`);

  const reg = await ethers.getContractAt("MetadataRegistry", registryAddr, signer);

  let successCount = 0;
  let alreadySetCount = 0;
  let failCount = 0;

  for (const row of res.rows) {
    const id = row.id;
    const uri = `${baseUrl}/api/challenges/meta/${id}`;
    process.stdout.write(`  Challenge ${id}: `);

    if (dryRun) {
      console.log(`[DRY RUN] would call ownerSet(${cpAddr}, ${id}, ${uri})`);
      continue;
    }

    try {
      const tx = await reg.ownerSet(cpAddr, BigInt(id), uri);
      const receipt = await tx.wait();
      console.log(`SUCCESS tx=${tx.hash} block=${receipt?.blockNumber}`);

      await pool.query(
        `UPDATE public.challenges
         SET registry_status = 'success',
             registry_tx_hash = $2,
             registry_error = NULL,
             updated_at = now()
         WHERE id = $1::bigint`,
        [id, tx.hash]
      );
      successCount++;
    } catch (e: any) {
      const msg: string = e?.shortMessage || e?.message || String(e);

      if (msg.includes("AlreadySet")) {
        console.log("ALREADY_SET (write-once OK)");
        await pool.query(
          `UPDATE public.challenges
           SET registry_status = 'success',
               registry_error = NULL,
               updated_at = now()
           WHERE id = $1::bigint`,
          [id]
        );
        alreadySetCount++;
      } else {
        console.log(`FAILED: ${msg.slice(0, 120)}`);
        await pool.query(
          `UPDATE public.challenges
           SET registry_status = 'failed',
               registry_error = $2,
               updated_at = now()
           WHERE id = $1::bigint`,
          [id, msg.slice(0, 500)]
        );
        failCount++;
      }
    }
  }

  console.log(`
================================================================================
Results: ${successCount} written, ${alreadySetCount} already set, ${failCount} failed
================================================================================
`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
