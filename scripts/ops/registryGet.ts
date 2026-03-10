// scripts/ops/registryGet.ts
import "@nomicfoundation/hardhat-ethers";
import hre from "hardhat";
const { ethers, network } = hre;

import { readDeployments } from "../dev/deploy_all";
import { header, info, fail } from "../dev/utils";

function needAddr(name: string, v?: string) {
  if (!v || !ethers.isAddress(v)) throw new Error(`${name} must be a valid 0x-address`);
  return v;
}

async function main() {
  header("Registry: uri() read");

  const dep = readDeployments(network.name);
  const registry = needAddr("metadataRegistry", process.env.REGISTRY ?? dep.metadataRegistry);
  const chAddr   = needAddr("challengeContract", process.env.CH_ADDR);
  const idStr    = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(idStr)) throw new Error("CH_ID must be a non-negative integer");
  const chId     = BigInt(idStr);

  const [signer] = await ethers.getSigners();
  const reg = await ethers.getContractAt("MetadataRegistry", registry, signer);

  info("Network", network.name);
  info("Registry", registry);
  info("Reader", await signer.getAddress());
  info("Challenge", chAddr);
  info("Id", chId.toString());

  const uri = await reg.uri(chAddr, chId);
  console.log(`\nURI: ${uri || "(empty)"}\n`);
}

main().catch(fail);