// scripts/syncAbis.ts
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";

const DEPLOY_DIR = join(process.cwd(), "deployments", "lightchain");
const OUT_DIR    = join(process.cwd(), "webapp", "public", "abi");

function isContractJson(file: string) {
  // ignore bookkeeping files/folders from hardhat-deploy
  return file.endsWith(".json")
    && !file.startsWith(".")
    && file !== "chainId"
    && !file.startsWith("solcInputs");
}

function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(DEPLOY_DIR).filter(isContractJson);

  const written: string[] = [];
  for (const f of files) {
    const p = join(DEPLOY_DIR, f);
    const j = JSON.parse(readFileSync(p, "utf8"));

    // hardhat-deploy keeps abi at top-level key "abi"
    const abi = j.abi || j.ABI || j.contract?.abi;
    if (!abi) continue;

    const name = basename(f, ".json");
    const outPath = join(OUT_DIR, `${name}.abi.json`);
    writeFileSync(outPath, JSON.stringify({ abi }, null, 2));
    written.push(`${name}.abi.json`);
  }

  // optional: write an index of what’s available
  const indexPath = join(OUT_DIR, "_index.json");
  writeFileSync(indexPath, JSON.stringify({ files: written }, null, 2));

  console.log(`✓ Synced ${written.length} ABIs to ${OUT_DIR}`);
}

main();