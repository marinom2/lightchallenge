import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { mergeDeployments } from "./_deployments"; // <-- adjust import path to where your helper lives

function readAddr(file: string): string | null {
  if (!existsSync(file)) return null;
  const j = JSON.parse(readFileSync(file, "utf8"));
  return j?.address ?? null;
}

async function main() {
  // hardhat-deploy writes here
  const base = join(process.cwd(), "deployments", "lightchain");

  const contracts: Record<string, string> = {};

  const mapping: Record<string, string> = {
    ChallengePay: "ChallengePay.json",
    Treasury: "Treasury.json",
    AivmProofVerifier: "AivmProofVerifier.json",
    ZkProofVerifier: "ZkProofVerifier.json",
    MultiSigProofVerifier: "MultiSigProofVerifier.json",
    AutoApprovalStrategy: "AutoApprovalStrategy.json",
    MetadataRegistry: "MetadataRegistry.json",
    PlonkVerifier: "PlonkVerifier.json",
    PlonkProofVerifierAdapter: "PlonkProofVerifierAdapter.json",
    EventChallengeRouter: "EventChallengeRouter.json", // optional
  };

  for (const [key, filename] of Object.entries(mapping)) {
    const addr = readAddr(join(base, filename));
    if (addr) contracts[key] = addr;
  }

  // write webapp/public/deployments/lightchain.json
  const hre = require("hardhat");
  await mergeDeployments(hre, contracts);

  console.log("✅ Synced webapp deployments:", contracts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});