// scripts/abi/sync-abis.ts
import * as hre from "hardhat";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

type DeploymentsFile = {
  chainId?: number;
  rpcUrl?: string;
  contracts?: Record<string, string>;
};

const DEPLOYMENTS_PATH = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json");
const ABI_DIR = join(process.cwd(), "webapp", "public", "abi");

// Keys that are allowed to exist in deployments as plain addresses (not contracts)
const ADDRESS_ONLY_KEYS = new Set<string>([
  "Protocol", // fee recipient / DAO / multisig address label
]);

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readDeployments(): DeploymentsFile {
  if (!existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(`Missing deployments file: ${DEPLOYMENTS_PATH}\nDeploy first, or create it.`);
  }
  return JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8")) as DeploymentsFile;
}

function isArtifactMissingError(e: any): boolean {
  const msg = (e?.message || e?.shortMessage || String(e)).toLowerCase();
  return (
    msg.includes("artifact") &&
    (msg.includes("not found") || msg.includes("does not exist") || msg.includes("missing"))
  );
}

async function main() {
  const { artifacts, network, ethers } = hre;

  const df = readDeployments();
  const contracts = df.contracts || {};
  const names = Object.keys(contracts);

  if (!names.length) {
    throw new Error(`No contracts found in ${DEPLOYMENTS_PATH} under "contracts".`);
  }

  ensureDir(ABI_DIR);

  console.log(`\n🔧 Sync ABIs → ${ABI_DIR}`);
  console.log(`Network: ${network.name}`);
  console.log(`Found ${names.length} entries in deployments:\n- ${names.join("\n- ")}\n`);

  const index: Record<string, { address: string; abiFile: string }> = {};
  const addressOnly: Array<{ name: string; address: string }> = [];

  for (const name of names) {
    const address = contracts[name];

    if (!address || !ethers.isAddress(address)) {
      console.log(`⚠️ Skipping ${name}: invalid address (${address})`);
      continue;
    }

    // Explicitly treat known keys as address-only
    if (ADDRESS_ONLY_KEYS.has(name)) {
      addressOnly.push({ name, address });
      console.log(`ℹ️ Address-only: ${name} = ${address}`);
      continue;
    }

    try {
      const art = await artifacts.readArtifact(name);
      const file = `${name}.abi.json`;
      const out = join(ABI_DIR, file);

      writeFileSync(out, JSON.stringify({ abi: art.abi }, null, 2));
      console.log(`✓ wrote ${file}`);

      index[name] = { address, abiFile: file };
    } catch (e: any) {
      if (isArtifactMissingError(e)) {
        // Not necessarily a problem: could be an address-only label in deployments
        addressOnly.push({ name, address });
        console.log(`ℹ️ Address-only (no artifact): ${name} = ${address}`);
        continue;
      }
      // Unexpected errors should surface
      throw e;
    }
  }

  // Single index the webapp can load once
  const indexPath = join(ABI_DIR, "index.json");
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\n✓ wrote index.json (${Object.keys(index).length} ABI entries)`);

  if (addressOnly.length) {
    const addrOnlyPath = join(ABI_DIR, "address-only.json");
    writeFileSync(addrOnlyPath, JSON.stringify(addressOnly, null, 2));
    console.log(`✓ wrote address-only.json (${addressOnly.length} entries)`);
  }

  console.log(`✅ Done.\n`);
}

main().catch((e) => {
  console.error("\nERROR:", e?.message ?? e);
  process.exit(1);
});