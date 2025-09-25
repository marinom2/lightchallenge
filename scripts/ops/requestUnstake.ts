// scripts/ops/requestUnstake.ts
//
// Request to unstake a portion. Will fail if you have open vote locks.
//
// Usage:
//   ADDR=<ChallengePay> AMOUNT=<eth> \
//   npx hardhat run scripts/ops/requestUnstake.ts --network <net>
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import { context, header, info, fail, toWei, NATIVE_SYMBOL } from "../dev/utils";

async function main() {
  header("Validator — Request Unstake");
  const { cp, addr, net, signer } = await context();

  const amountWei = toWei(process.env.AMOUNT ?? "");
  if (amountWei <= 0n) throw new Error("AMOUNT must be > 0");

  const me = await signer.getAddress();

  info("Network", net || network.name);
  info("Validator", me);
  info("Contract", addr);

  const stake = await cp.validatorStake(me);
  console.log("Current stake:", ethers.formatUnits(stake, 18), NATIVE_SYMBOL);

  try {
    const tx = await cp.requestUnstake(amountWei);
    console.log("Tx:", tx.hash);
    const rec = await tx.wait();
    console.log("Included in block:", rec.blockNumber);

    const pend = await cp.pendingUnstake(me);
    const unlock = await cp.pendingUnstakeUnlockAt(me);
    console.log("Pending unstake:", ethers.formatUnits(pend, 18), NATIVE_SYMBOL);
    console.log("Unlock at (unix):", unlock.toString());
    console.log("\n✅ Unstake requested.");
  } catch (e: any) {
    const m = (e?.error?.message || e?.message || "").toLowerCase();
    console.log("\n❌ RequestUnstake reverted.");
    if (m.includes("hasopenvotelocks")) console.log("- You have open vote locks — wait until finalize/close.");
    if (m.includes("minstakenotmet")) console.log("- Amount exceeds your current stake.");
    console.log("\nDetails:", e?.message || e);
  }
}

main().catch(fail);