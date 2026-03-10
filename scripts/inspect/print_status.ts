// scripts/inspect/print_status.ts
import hre from "hardhat";
const { ethers } = hre;;
import { readFileSync } from "fs";
import { join } from "path";

type DeployJson = {
  chainId: number;
  rpcUrl?: string;
  contracts: Record<string, string | undefined>;
};

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  console.log(`Network: ${net.name} (${net.chainId})`);
  console.log(`Signer:  ${signer.address}`);

  const file = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json");
  const d: DeployJson = JSON.parse(readFileSync(file, "utf8"));

  const results: Array<{ name: string; addr?: string; hasCode: boolean }> = [];

  for (const [name, addr] of Object.entries(d.contracts)) {
    if (!addr) { results.push({ name, addr, hasCode: false }); continue; }
    const code = await ethers.provider.getCode(addr);
    results.push({ name, addr, hasCode: code !== "0x" });
  }

  for (const r of results) {
    console.log(`${r.name.padEnd(26)} ${r.addr ?? "-".repeat(42)}  ${r.hasCode ? "✅" : "❌"}`);
  }

  // Extra: sample reads if present
  const cpAddr = d.contracts["ChallengePay"];
  if (cpAddr) {
    const cp = await ethers.getContractAt("ChallengePay", cpAddr);
    const [treasury, protocol, fees] = await Promise.all([
      cp.treasury(), cp.protocol(), cp.getFeeConfig()
    ]);
    console.log("\nChallengePay:");
    console.log("  treasury:", treasury);
    console.log("  protocol:", protocol);
    console.log("  fees:", fees);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });