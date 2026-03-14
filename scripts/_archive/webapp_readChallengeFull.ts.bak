// scripts/readChallengeFull.ts
import { ABI, ADDR, publicClient } from "../lib/contracts";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function baseUrl() {
  return process.env.APP_BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
}
const STATUS = ["Pending","Approved","Rejected","Finalized"] as const;

function fmt(x: bigint) { return Number(formatUnits(x, 18)).toString(); }

async function readMeta(idStr: string) {
  try {
    const r = await fetch(`${baseUrl()}/api/challenges`, { cache: "no-store" });
    if (r.ok) {
      const j: any = await r.json();
      const items: any[] = Array.isArray(j?.items) ? j.items : [];
      return items.find((m) => String(m.id) === idStr);
    }
  } catch {}
  // filesystem fallback
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(__dirname, "../public/challenges.json");
  const raw = await readFile(file, "utf-8").catch(() => "[]");
  const j = JSON.parse(raw);
  const arr: any[] = Array.isArray(j?.models) ? j.models : Array.isArray(j) ? j : [];
  return arr.find((m) => String(m.id) === idStr);
}

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("Usage: tsx scripts/readChallengeFull.ts <id>");
  const id = BigInt(raw);

  const c: any = await publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "getChallenge",
    args: [id],
  });

  const statusNum = Number(c.status ?? c[2] ?? 0);
  const pool = BigInt(c.pool ?? c[21] ?? 0n);
  const stake = BigInt(c.stake ?? c[7] ?? 0n);
  const bond = BigInt(c.proposalBond ?? c[8] ?? 0n);

  console.log("On-chain:");
  console.log("  Status   :", STATUS[statusNum] ?? statusNum);
  console.log("  Stake    :", fmt(stake));
  console.log("  Bond     :", fmt(bond));
  console.log("  Pool     :", fmt(pool));

  const meta = await readMeta(String(id));
  console.log("Off-chain:");
  if (!meta) {
    console.log("  (no metadata)");
  } else {
    console.log("  Title    :", meta.title ?? "—");
    console.log("  Game     :", meta.game ?? "—");
    console.log("  Mode     :", meta.mode ?? "—");
    console.log("  Tags     :", Array.isArray(meta.tags) ? meta.tags.join(", ") : "—");
  }
}
main().catch((e)=>{ console.error(e); process.exit(1); });