import { execFileSync } from "node:child_process";
import fs from "fs";
import path from "path";

const chId = process.env.CH_ID;
if (!/^\d+$/.test(String(chId || ""))) {
  console.error("Set CH_ID=<challenge id>");
  process.exit(1);
}

const outDir = "snapshots";
fs.mkdirSync(outDir, { recursive: true });

const iso = new Date().toISOString().replace(/[:.]/g, "");
const file = path.join(outDir, `challenge-${chId}-${iso}.json`);

const env = { ...process.env, OUT: file };

const out = execFileSync(
  "npx",
  ["hardhat", "run", "scripts/exportChallenge.ts", "--network", process.env.HARDHAT_NETWORK || "lightchain"],
  { env, encoding: "utf8" }
);

process.stdout.write(out);
console.log(`✅ Snapshot saved: ${file}`);