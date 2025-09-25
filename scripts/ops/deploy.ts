// scripts/ops/deploy.ts
import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import { keccak256, toUtf8Bytes } from "ethers";
import { header, info, warn, fail } from "../dev/utils";
import { deploymentsPath, readDeployments, writeDeployments } from "../dev/deployments";

// CI-friendly: print runtime bytecode length + a short checksum
async function logCodeMeta(address: string) {
  const code = await ethers.provider.getCode(address);
  const bytesLen = code ? (code.length - 2) / 2 : 0; // hex -> bytes
  const checksum =
    code && code.length >= 66 ? keccak256(toUtf8Bytes(code.slice(0, 66))) : "0x";
  console.log(`Bytecode: ${bytesLen} bytes  |  checksum: ${checksum.slice(0, 18)}…`);
}

async function main() {
  header("Deploying ChallengePay (idempotent)");

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const daoTreasury = process.env.DAO_TREASURY ?? deployerAddr;

  info("Network", network.name);
  info("Deployer", deployerAddr);
  info("DAO Treasury", daoTreasury);

  const prev = readDeployments(network.name);

  // Prefer env override if provided
  const envAddr =
    process.env.CONTRACT_ADDR ||
    process.env.CONTRACT ||
    process.env.ADDR ||
    process.env.CP_ADDR;
  const savedAddr: string | undefined =
    (envAddr && /^0x[0-9a-fA-F]{40}$/.test(envAddr) ? envAddr : undefined) ||
    prev.address ||
    prev.contract ||
    prev.ChallengePay ||
    prev.cp;

  if (savedAddr) {
    const code = await ethers.provider.getCode(savedAddr);
    if (code && code !== "0x") {
      warn(`Found existing ChallengePay at ${savedAddr}. Skipping deploy.`);
      await logCodeMeta(savedAddr);

      const merged = {
        ...prev,
        address: savedAddr,
        contract: savedAddr,
        ChallengePay: savedAddr,
        cp: savedAddr,
        _lastCheckedAt: new Date().toISOString(),
      };
      writeDeployments(merged, network.name);
      info("Saved", deploymentsPath(network.name));
      console.log(`\n✅ Contract ready at ${savedAddr}\n`);
      return;
    } else {
      warn(`No code at saved address ${savedAddr}. Will deploy fresh.`);
    }
  }

  // Fresh deploy — constructor expects only daoTreasury
  const F = await ethers.getContractFactory("ChallengePay");
  const c = await F.deploy(daoTreasury);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  info("Deployed at", addr);
  await logCodeMeta(addr);

  const merged = {
    ...prev,
    address: addr,
    contract: addr,
    ChallengePay: addr,
    cp: addr,
    _lastDeployedBy: deployerAddr,
    _lastDeployedAt: new Date().toISOString(),
  };
  writeDeployments(merged, network.name);
  info("Saved", deploymentsPath(network.name));

  console.log(`\n✅ Contract ready at ${addr}\n`);
}

main().catch(fail);