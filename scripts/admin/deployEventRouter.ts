import { ethers } from "hardhat";

async function main() {
  const { CHALLENGEPAY, METADATA_REGISTRY } = process.env;
  if (!CHALLENGEPAY || !METADATA_REGISTRY) throw new Error("Set CHALLENGEPAY and METADATA_REGISTRY env vars");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const F = await ethers.getContractFactory("EventChallengeRouter");
  const r = await F.deploy(CHALLENGEPAY, METADATA_REGISTRY);
  await r.waitForDeployment();
  console.log("EventChallengeRouter:", await r.getAddress());
}

main().catch(e => { console.error(e); process.exit(1); });
