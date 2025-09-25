// scripts/admin/deployMockVerifier.ts
import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers, network } = hardhat;

import { readDeployments, writeDeployments } from "../dev/deployments";

function log(k: string, v: string) { console.log(k.padEnd(12), ":", v); }

async function main() {
  console.log(`
================================================================================
Deploying MockProofVerifier (idempotent)
================================================================================
`.trim());

  const [deployer] = await ethers.getSigners();
  const net = network.name;

  log("Network", net);
  log("Deployer", await deployer.getAddress());

  // If deployments/<net>.json already has a live mock, reuse it
  const dep = readDeployments(net);
  const saved = dep.mockVerifier as string | undefined;
  if (saved && ethers.isAddress(saved)) {
    const code = await ethers.provider.getCode(saved);
    if (code && code !== "0x") {
      log("Reusing", saved);
      writeDeployments({ ...dep, mockVerifier: saved, _mockLastCheckedAt: new Date().toISOString() }, net);
      console.log("\n✅ MockProofVerifier ready at", saved);
      return;
    }
  }

  const F = await ethers.getContractFactory("MockProofVerifier");
  const mock = await F.deploy();
  await mock.waitForDeployment();
  const addr = await mock.getAddress();

  const rec = await mock.deploymentTransaction()?.wait();
  log("Deployed", addr);
  if (rec) log("Block", String(rec.blockNumber));

  writeDeployments(
    { ...dep, mockVerifier: addr, _mockDeployedAt: new Date().toISOString(), _mockDeployedBy: await deployer.getAddress() },
    net
  );

  console.log("Saved       : deployments/%s.json (mockVerifier)", net);
  console.log("\n✅ MockProofVerifier ready at", addr);
}

main().catch((e) => { console.error(e); process.exit(1); });