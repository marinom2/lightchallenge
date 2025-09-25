import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ethers";
// scripts/listValidators.ts
import hardhat from "hardhat";
const { ethers } = hardhat;
import { context, header, info, fmtWei, fail } from "../dev/utils";

function pad(s: string, n: number) { return (s + " ".repeat(n)).slice(0, n); }

async function main() {
  header("Validators — stakes & locks");

  const { cp, net, addr } = await context();
  info("Network", net);
  info("Contract", addr);

  let addrs: string[] = [];
  const csv = process.env.ADDRESSES || process.env.ADDRS || "";
  if (csv) {
    addrs = csv.split(",").map(s => s.trim()).filter(Boolean);
  } else {
    // fallback: first 10 signers (local dev)
    const signers = await ethers.getSigners();
    addrs = signers.slice(0, Math.min(signers.length, 10)).map((s: any) => s.address);
  }

  const total = await cp.totalValidatorStake?.().catch(() => 0n);

  console.log(`\nTotal validator stake: ${fmtWei(total)} LCAI\n`);
  console.log(pad("Address", 44), pad("Stake (LCAI)", 16), pad("PendingUnstake", 16), pad("UnlockAt", 12), "VoteLocks");
  console.log("-".repeat(44 + 1 + 16 + 1 + 16 + 1 + 12 + 1 + 9));

  for (const a of addrs) {
    const stake: bigint = await cp.validatorStake(a).catch(() => 0n);
    const pend: bigint = await cp.pendingUnstake(a).catch(() => 0n);
    const unlockAt: bigint = await cp.pendingUnstakeUnlockAt(a).catch(() => 0n);
    const locks: bigint = await cp.voteLocks(a).catch(() => 0n);

    console.log(
      pad(a, 44),
      pad(fmtWei(stake), 16),
      pad(fmtWei(pend), 16),
      pad(unlockAt.toString(), 12),
      locks.toString()
    );
  }
  console.log("");
}

main().catch(fail);