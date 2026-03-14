// deploy/10_deployTrustedForwarder.ts
import * as hre from "hardhat";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

function mustEnv(key: string): string {
  const v = (process.env[key] || "").trim();
  if (!v) throw new Error(`Missing ${key} in environment.`);
  return v;
}

async function main() {
  const { ethers, network } = hre;

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available (ethers.getSigners())");
  const signerAddr = await signer.getAddress();

  console.log(`Network : ${network.name}`);
  console.log(`Signer  : ${signerAddr}`);

  // Constructor args
  const initialOwnerRaw = mustEnv("FORWARDER_ARG0");
  if (!ethers.isAddress(initialOwnerRaw)) {
    throw new Error(`FORWARDER_ARG0 must be a valid address, got: ${initialOwnerRaw}`);
  }
  const initialOwner = ethers.getAddress(initialOwnerRaw);

  console.log(`TrustedForwarder args:`);
  console.log(`- initialOwner: ${initialOwner}`);

  // Deploy
  console.log(`\nDeploying TrustedForwarder...`);
  const F = await ethers.getContractFactory("TrustedForwarder", signer);

  // Hardhat/ethers typings can be annoying here; this is safe in scripts.
  const fwd = await (F as any).deploy(initialOwner);
  await fwd.waitForDeployment();
  const addr = await fwd.getAddress();

  console.log(`✅ TrustedForwarder deployed: ${addr}`);

  // Persist: deployments + ABI
  await mergeDeployments(hre, { TrustedForwarder: addr });
  await writeAbi(hre, "TrustedForwarder");

  console.log(`✅ Saved deployments + ABI for TrustedForwarder`);
}

// Only run when invoked directly (not when hardhat-deploy scans the deploy/ directory)
if (require.main === module) {
  main().catch((e) => {
    console.error("\nERROR:", e?.shortMessage ?? e?.message ?? e);
    process.exit(1);
  });
}