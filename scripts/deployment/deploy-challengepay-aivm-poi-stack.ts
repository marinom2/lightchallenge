import * as fs from "node:fs";
import * as path from "node:path";
import { ethers, network } from "hardhat";

type DeploymentRecord = {
  network: string;
  chainId: string;
  deployer: string;
  timestamp: string;
  ts: number;
  contracts: {
    ChallengePay: string;
    AIVMInferenceV2: string;
    ChallengeTaskRegistry: string;
    ChallengePayAivmPoiVerifier: string;
  };
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const challengePay = requireEnv("CHALLENGEPAY_ADDRESS");
  const aivmInferenceV2 = requireEnv("AIVM_INFERENCE_V2_ADDRESS");

  const admin =
    process.env.AIVM_OWNER?.trim() ||
    process.env.ADMIN_ADDRESS?.trim() ||
    process.env.DEPLOYER_ADDRESS?.trim() ||
    "";

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const adminAddress = admin || deployerAddress;

  const chain = await ethers.provider.getNetwork();
  const chainId = chain.chainId.toString();

  console.log("=== Deploy ChallengePay AIVM + PoI stack ===");
  console.log("network=", network.name);
  console.log("chainId=", chainId);
  console.log("deployer=", deployerAddress);
  console.log("admin=", adminAddress);
  console.log("ChallengePay=", challengePay);
  console.log("AIVMInferenceV2=", aivmInferenceV2);

  // ------------------------------------------------------------
  // Deploy ChallengeTaskRegistry
  // Constructor:
  //   ChallengeTaskRegistry(address initialOwner)
  // ------------------------------------------------------------
  const TaskRegistry = await ethers.getContractFactory("ChallengeTaskRegistry");
  const taskRegistry = await TaskRegistry.deploy(adminAddress);
  await taskRegistry.waitForDeployment();
  const taskRegistryAddress = await taskRegistry.getAddress();

  console.log("ChallengeTaskRegistry=", taskRegistryAddress);

  // ------------------------------------------------------------
  // Deploy ChallengePayAivmPoiVerifier
  // Constructor:
  //   ChallengePayAivmPoiVerifier(
  //     address initialOwner,
  //     address aivm_,
  //     address taskRegistry_
  //   )
  // ------------------------------------------------------------
  const PoiVerifier = await ethers.getContractFactory("ChallengePayAivmPoiVerifier");
  const poiVerifier = await PoiVerifier.deploy(
    adminAddress,
    aivmInferenceV2,
    taskRegistryAddress
  );
  await poiVerifier.waitForDeployment();
  const poiVerifierAddress = await poiVerifier.getAddress();

  console.log("ChallengePayAivmPoiVerifier=", poiVerifierAddress);

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    ts: Date.now(),
    contracts: {
      ChallengePay: challengePay,
      AIVMInferenceV2: aivmInferenceV2,
      ChallengeTaskRegistry: taskRegistryAddress,
      ChallengePayAivmPoiVerifier: poiVerifierAddress,
    },
  };

  const outDir = path.join(process.cwd(), "data", "deployments", network.name);
  ensureDir(outDir);

  const outPath = path.join(outDir, "ChallengePayAivmPoiStack.json");
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2));

  console.log("");
  console.log("=== Done ===");
  console.log(`Saved: ${outPath}`);
  console.log("");
  console.log("Export these:");
  console.log(`CHALLENGE_TASK_REGISTRY_ADDRESS=${taskRegistryAddress}`);
  console.log(`CHALLENGEPAY_AIVM_POI_VERIFIER_ADDRESS=${poiVerifierAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});