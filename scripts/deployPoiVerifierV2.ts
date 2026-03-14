/**
 * scripts/deployPoiVerifierV2.ts
 *
 * Standalone deploy script for ChallengeTaskRegistry + ChallengePayAivmPoiVerifier.
 * Uses ethers directly to avoid hardhat-deploy archive scanning issues.
 *
 * Usage:
 *   npx tsx scripts/deployPoiVerifierV2.ts
 *
 * Required env:
 *   PRIVATE_KEY                  — deployer/owner private key
 *   AIVM_INFERENCE_V2_ADDRESS    — AIVMInferenceV2 address on-chain
 *
 * Optional env:
 *   AIVM_OWNER                   — override owner address (defaults to deployer)
 *   LIGHTCHAIN_RPC / NEXT_PUBLIC_RPC_URL
 */

import "dotenv/config";
import { ethers } from "ethers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const DEPLOYMENTS_FILE = join(ROOT, "webapp", "public", "deployments", "lightchain.json");
const ABI_DIR = join(ROOT, "webapp", "public", "abi");

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function readArtifact(contractPath: string) {
  const artifactPath = join(ROOT, "artifacts", "contracts", contractPath);
  return JSON.parse(readFileSync(artifactPath, "utf8"));
}

async function main() {
  const rpc =
    process.env.LIGHTCHAIN_RPC ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    "https://light-testnet-rpc.lightchain.ai";
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("Missing PRIVATE_KEY");

  const aivmAddr = process.env.AIVM_INFERENCE_V2_ADDRESS;
  if (!aivmAddr) throw new Error("Missing AIVM_INFERENCE_V2_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpc);
  const deployer = new ethers.Wallet(pk, provider);
  const deployerAddr = await deployer.getAddress();
  const owner = process.env.AIVM_OWNER || deployerAddr;

  console.log(`\n🚀 Deploying PoI Verifier V2`);
  console.log(`network: ${rpc}`);
  console.log(`deployer: ${deployerAddr}`);
  console.log(`owner: ${owner}`);
  console.log(`AIVM: ${aivmAddr}`);

  // ── 1. ChallengeTaskRegistry ───────────────────────────────────────────────
  const registryArt = readArtifact(
    "registry/ChallengeTaskRegistry.sol/ChallengeTaskRegistry.json"
  );
  console.log("\n[1/2] Deploying ChallengeTaskRegistry...");
  const registryFactory = new ethers.ContractFactory(
    registryArt.abi,
    registryArt.bytecode,
    deployer
  );
  const registryTx = await registryFactory.deploy(owner);
  await registryTx.waitForDeployment();
  const taskRegistryAddr = await registryTx.getAddress();
  console.log(`✓ ChallengeTaskRegistry @ ${taskRegistryAddr}`);

  // ── 2. ChallengePayAivmPoiVerifier ────────────────────────────────────────
  const verifierArt = readArtifact(
    "verifiers/ChallengePayAivmPoiVerifier.sol/ChallengePayAivmPoiVerifier.json"
  );
  console.log("\n[2/2] Deploying ChallengePayAivmPoiVerifier...");
  const verifierFactory = new ethers.ContractFactory(
    verifierArt.abi,
    verifierArt.bytecode,
    deployer
  );
  const verifierTx = await verifierFactory.deploy(owner, aivmAddr, taskRegistryAddr);
  await verifierTx.waitForDeployment();
  const verifierAddr = await verifierTx.getAddress();
  console.log(`✓ ChallengePayAivmPoiVerifier @ ${verifierAddr}`);

  // ── 2b. Register worker as dispatcher on ChallengeTaskRegistry ────────────
  // The worker wallet (LCAI_WORKER_PK) submits AIVM requests and calls
  // recordBinding. It must be authorized as a dispatcher by the registry owner.
  const workerPk = process.env.LCAI_WORKER_PK || process.env.PRIVATE_KEY || "";
  if (workerPk) {
    const workerAddr = new ethers.Wallet(workerPk).address;
    const adminPk = process.env.ADMIN_PRIVATE_KEY || pk;
    const adminSigner = new ethers.Wallet(adminPk, provider);
    const registryContract = new ethers.Contract(taskRegistryAddr, registryArt.abi, adminSigner);
    const alreadyDispatcher = await registryContract.dispatchers(workerAddr);
    if (!alreadyDispatcher) {
      const dispatchTx = await registryContract.setDispatcher(workerAddr, true);
      await dispatchTx.wait(1);
      console.log(`✓ Registered ${workerAddr} as dispatcher on ChallengeTaskRegistry`);
    } else {
      console.log(`✓ ${workerAddr} already a dispatcher (skipped)`);
    }
  }

  // ── 3. Update deployments file ────────────────────────────────────────────
  ensureDir(join(ROOT, "webapp", "public", "deployments"));
  let current: Record<string, unknown> = {};
  if (existsSync(DEPLOYMENTS_FILE)) {
    current = JSON.parse(readFileSync(DEPLOYMENTS_FILE, "utf8"));
  }
  const contracts = { ...(current.contracts as Record<string, string> || {}), ChallengeTaskRegistry: taskRegistryAddr, ChallengePayAivmPoiVerifier: verifierAddr };
  const out = { ...current, contracts };
  writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n✓ Updated ${DEPLOYMENTS_FILE}`);

  // ── 4. Write ABIs ─────────────────────────────────────────────────────────
  ensureDir(ABI_DIR);
  writeFileSync(
    join(ABI_DIR, "ChallengeTaskRegistry.abi.json"),
    JSON.stringify({ abi: registryArt.abi }, null, 2)
  );
  writeFileSync(
    join(ABI_DIR, "ChallengePayAivmPoiVerifier.abi.json"),
    JSON.stringify({ abi: verifierArt.abi }, null, 2)
  );
  console.log(`✓ Wrote ABI files to ${ABI_DIR}`);

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║ PoI Verifier V2 Deployed                                     ║
╠══════════════════════════════════════════════════════════════╣
║ ChallengeTaskRegistry:      ${taskRegistryAddr.padEnd(34)} ║
║ ChallengePayAivmPoiVerifier: ${verifierAddr.padEnd(33)} ║
╠══════════════════════════════════════════════════════════════╣
║ Add to .env:                                                 ║
║   CHALLENGE_TASK_REGISTRY_ADDRESS=${taskRegistryAddr.padEnd(26)} ║
║   CHALLENGEPAY_AIVM_POI_VERIFIER_ADDRESS=${verifierAddr.padEnd(20)} ║
╚══════════════════════════════════════════════════════════════╝
`);
}

main().catch((e) => {
  console.error("Deploy failed:", e);
  process.exit(1);
});
