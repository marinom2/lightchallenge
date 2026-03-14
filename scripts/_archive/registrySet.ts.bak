// scripts/admin/registrySet.ts
import "@nomicfoundation/hardhat-ethers";
import * as hre from "hardhat";
const { ethers, network } = hre;

import { readDeployments } from "../dev/deploy_all";
import { header, info, fail } from "../dev/utils";

function needAddr(name: string, v?: string) {
  if (!v || !ethers.isAddress(v)) throw new Error(`${name} must be a valid 0x-address`);
  return v;
}

async function main() {
  header("Registry: ownerSet");

  const dep = readDeployments(network.name);
  const registry = needAddr("metadataRegistry", process.env.REGISTRY ?? dep.metadataRegistry);
  const chAddr   = needAddr("challengeContract", process.env.CH_ADDR);
  const idStr    = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(idStr)) throw new Error("CH_ID must be a non-negative integer");
  const chId     = BigInt(idStr);
  const uri      = process.env.URI ?? "";
  if (uri === undefined) throw new Error("URI is required (e.g. ipfs://hash)");

  const [signer] = await ethers.getSigners();
  const reg = await ethers.getContractAt("MetadataRegistry", registry, signer);

  info("Network", network.name);
  info("Registry", registry);
  info("Owner", await signer.getAddress());
  info("Challenge", chAddr);
  info("Id", chId.toString());
  info("URI", uri);

  const tx = await reg.ownerSet(chAddr, chId, uri);
  const rec = await tx.wait();
  info("Tx", tx.hash);
  info("Block", rec.blockNumber);
  console.log("\n✅ metadata set.\n");
}

main().catch(fail);