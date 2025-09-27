// scripts/ops/normalizeDeployments.ts
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const file = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json")
const json = JSON.parse(readFileSync(file, "utf8"))

if (json?.contracts) {
  if (json.contracts.Treasury == null && json.contracts.DaoTreasury) {
    json.contracts.Treasury = json.contracts.DaoTreasury
  }
  delete json.contracts.DaoTreasury
}

writeFileSync(file, JSON.stringify(json, null, 2))
console.log("✓ normalized", file)