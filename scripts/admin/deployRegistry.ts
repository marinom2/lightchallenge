// scripts/admin/deployRegistry.ts
import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers, network } = hardhat;

import { readDeployments, writeDeployments } from "../dev/deployments";
import { header, info, warn, fail } from "../dev/utils";

function isAddr(a?: string) {
  try { return !!a && ethers.isAddress(a); } catch { return false; }
}

async function main() {
  header("Deploy MetadataRegistry (idempotent)");

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  // Resolve owner (explicit > TREASURY > deployer)
  const owner =
    (process.env.REGISTRY_OWNER && isAddr(process.env.REGISTRY_OWNER) && process.env.REGISTRY_OWNER) ||
    (process.env.TREASURY && isAddr(process.env.TREASURY) && process.env.TREASURY) ||
    deployerAddr;

  info("Network", network.name);
  info("Deployer", deployerAddr);
  info("Owner   ", owner);

  // Check if a registry is already recorded and alive
  const dep = readDeployments(network.name);
  const saved = dep.metadataRegistry as string | undefined;

  if (saved && isAddr(saved)) {
    const code = await ethers.provider.getCode(saved);
    if (code && code !== "0x") {
      warn(`Found existing MetadataRegistry at ${saved}. Skipping deploy.`);
      // touch file with a "lastChecked"
      writeDeployments(
        {
          ...dep,
          metadataRegistry: saved,
          _registryLastCheckedAt: new Date().toISOString(),
        },
        network.name
      );
      info("Saved", `deployments/${network.name}.json`);
      console.log(`\n✅ Registry ready at ${saved}\n`);
      return;
    } else {
      warn(`No bytecode at saved metadataRegistry ${saved}. Will deploy fresh.`);
    }
  }

  // Fresh deploy
  const F = await ethers.getContractFactory("MetadataRegistry", deployer);
  const reg = await F.deploy(owner);
  await reg.waitForDeployment();
  const addr = await reg.getAddress();

  info("Deployed", addr);

  writeDeployments(
    {
      ...dep,
      metadataRegistry: addr,
      _registryDeployedBy: deployerAddr,
      _registryDeployedAt: new Date().toISOString(),
    },
    network.name
  );
  info("Saved", `deployments/${network.name}.json`);

  console.log(`\n✅ Registry ready at ${addr}\n`);
}

main().catch(fail);