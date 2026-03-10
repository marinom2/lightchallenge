// webapp/scripts/sync-abis.mjs
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Paths
const webapp          = path.resolve(__dirname, "..");      // /webapp
const root            = path.resolve(webapp, "..");         // repo root (/lightchallenge)
const deploymentsFile = path.join(webapp, "public/deployments/lightchain.json");
const artifactsDir    = path.join(root, "artifacts", "contracts"); // Hardhat artifacts
const outDir          = path.join(webapp, "public", "abi");

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const dep = JSON.parse(await fs.readFile(deploymentsFile, "utf8"));
  const contractNames = Object.keys(dep.contracts || {});

  async function findArtifact(contractName) {
    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          const res = await walk(p);
          if (res) return res;
        } else if (e.isFile() && e.name === `${contractName}.json`) {
          const j = JSON.parse(await fs.readFile(p, "utf8"));
          if (j && j.abi) return j.abi;
        }
      }
      return null;
    }
    return walk(artifactsDir);
  }

  for (const name of contractNames) {
    const abi = await findArtifact(name);
    if (!abi) continue;
    const dst = path.join(outDir, `${name}.abi.json`);
    await fs.writeFile(dst, JSON.stringify({ abi }, null, 2), "utf8");
    console.log(`✓ ABI ${name} -> public/abi/${name}.abi.json`);
  }
}

main().catch((e) => {
  console.warn("[sync-abis] warning:", e?.message || e);
  process.exit(0);
});