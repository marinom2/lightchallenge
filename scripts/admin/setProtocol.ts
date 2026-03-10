import * as hre from "hardhat";
const { ethers } = hre;
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  // Read deployments to find ChallengePay if not provided in env
  const deployFile = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json");
  const json = JSON.parse(readFileSync(deployFile, "utf8"));
  const addr: string | undefined =
    process.env.CHALLENGEPAY_ADDR || json?.contracts?.ChallengePay;

  if (!addr) throw new Error("ChallengePay address not found (set CHALLENGEPAY_ADDR or update deployments file)");

  const protocol = process.env.PROTOCOL_SAFE;
  if (!protocol) throw new Error("Set PROTOCOL_SAFE in .env to the multisig/safe address");

  const [signer] = await ethers.getSigners();
  if (!signer) throw new Error("No signer available");

  const cp = await ethers.getContractAt("ChallengePay", addr, signer);

  // Call whichever exists: setProtocol (preferred) or setprotocol (legacy)
  if ("setProtocol" in cp && typeof (cp as any).setProtocol === "function") {
    const tx = await (cp as any).setProtocol(protocol);
    await tx.wait();
    console.log("✓ setProtocol:", protocol);
  } else if ("setprotocol" in cp && typeof (cp as any).setprotocol === "function") {
    const tx = await (cp as any).setprotocol(protocol);
    await tx.wait();
    console.log("✓ setprotocol:", protocol);
  } else {
    throw new Error("Neither setProtocol nor setprotocol function exists on ChallengePay. Update the contract or regenerate artifacts.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});