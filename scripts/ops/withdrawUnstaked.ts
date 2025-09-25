// scripts/ops/withdrawUnstaked.ts
//
// Withdraw unlocked pending unstake.
//
// Usage:
//   ADDR=<ChallengePay> \
//   npx hardhat run scripts/ops/withdrawUnstaked.ts --network <net>
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import { context, header, info, fail, NATIVE_SYMBOL } from "../dev/utils";

async function main() {
  header("Validator — Withdraw Unstaked");
  const { cp, addr, net, signer } = await context();

  const me = await signer.getAddress();

  info("Network", net || network.name);
  info("Validator", me);
  info("Contract", addr);

  const pend = await cp.pendingUnstake(me);
  const unlock = await cp.pendingUnstakeUnlockAt(me);
  console.log("Pending amount:", ethers.formatEther(pend), NATIVE_SYMBOL);
  console.log("Unlock at (unix):", unlock.toString());

  try {
    const tx = await cp.withdrawUnstaked();
    console.log("Tx:", tx.hash);
    const rec = await tx.wait();
    console.log("Included in block:", rec.blockNumber);
    console.log("\n✅ Withdrawn.");
  } catch (e: any) {
    const m = (e?.error?.message || e?.message || "").toLowerCase();
    console.log("\n❌ Withdraw reverted.");
    if (m.includes("cooldownnotelapsed")) console.log("- Cooldown not elapsed yet.");
    if (m.includes("amountzero")) console.log("- No pending amount to withdraw.");
    console.log("\nDetails:", e?.message || e);
  }
}

main().catch(fail);