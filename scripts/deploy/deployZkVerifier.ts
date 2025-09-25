import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const Zk = await ethers.getContractFactory("ZkProofVerifier");
  const zk = await Zk.deploy();
  await zk.waitForDeployment();
  console.log("ZkProofVerifier:", await zk.getAddress());

  const outPath = path.join("deployments", (process.env.HARDHAT_NETWORK || "unknown") + ".json");
  const json = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
  json.zkProofVerifier = await zk.getAddress();
  fs.writeFileSync(outPath, JSON.stringify(json, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });