// scripts/inspect/myPayout.ts
// Inspect payouts available to the caller (winner/loser/validator/creator).
//
// Usage:
//   CH_ID=20 npm run inspect:myPayout

import hre from "hardhat";
const { ethers, network } = hre;
import * as fs from "fs";
import * as path from "path";

function fail(e: any) {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
}
function fmtWei(v: bigint): string {
  const s = ethers.formatUnits(v, 18);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
function pickAddressFromDeployment(dep: any): string | undefined {
  const keys = ["address", "contract", "ChallengePay", "cp", "Contract", "contractAddress"];
  for (const k of keys) {
    const v = dep?.[k];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return v;
  }
  return undefined;
}

async function main() {
  const CH_ID = process.env.CH_ID;
  if (!CH_ID) throw new Error("CH_ID is required");

  const net = process.env.HARDHAT_NETWORK || network.name;
  const deployFile = path.join("deployments", `${net}.json`);
  if (!fs.existsSync(deployFile)) {
    throw new Error(`Missing deployments/${net}.json`);
  }
  const dep = JSON.parse(fs.readFileSync(deployFile, "utf8"));
  const addr = pickAddressFromDeployment(dep);
  if (!addr) throw new Error("No contract address found in deployments JSON");

  const [signer] = await ethers.getSigners();
  const cp = await ethers.getContractAt("ChallengePay", addr, signer);

  console.log(`\n— ChallengePay: My Payout Inspector —`);
  console.log(`Network: ${net}`);
  console.log(`Contract: ${addr}`);
  console.log(`Viewer: ${await signer.getAddress()}`);
  console.log(`Challenge: ${CH_ID}\n`);

  // Defensive ABI calls
  let owedWinner = 0n, owedLoser = 0n, owedValidator = 0n;
  try { owedWinner = await (cp as any).claimableWinner(CH_ID, signer.address); } catch {}
  try { owedLoser = await (cp as any).claimableLoser(CH_ID, signer.address); } catch {}
  try { owedValidator = await (cp as any).claimableValidator(CH_ID, signer.address); } catch {}

  const total = owedWinner + owedLoser + owedValidator;

  console.log("PAYOUTS");
  console.log("=======");
  console.log(`Winner side claimable : ${fmtWei(owedWinner)} LCAI`);
  console.log(`Loser cashback        : ${fmtWei(owedLoser)} LCAI`);
  console.log(`Validator reward      : ${fmtWei(owedValidator)} LCAI`);
  console.log("-------------------------------");
  console.log(`TOTAL claimable       : ${fmtWei(total)} LCAI\n`);
}

main().catch(fail);