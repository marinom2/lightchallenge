// scripts/ops/claimLoserCashback.ts
import hre from "hardhat";
const { ethers } = hre;
import { context, header, info, fail } from "../dev/utils";

async function main() {
  header("Claim — Loser Cashback");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const me = await signer.getAddress();

  info("Network", net);
  info("Signer", me);
  info("Contract", addr);
  info("Challenge", id.toString());

  // Must have a snapshot (finalized path) for loser cashback
  const snap = await cp.getSnapshot(id);
  if (!snap.set) {
    console.log("\nℹ️  Snapshot not set — loser cashback is not available yet.\n");
    return;
  }
  if (BigInt(snap.perLoserCashbackX) === 0n) {
    console.log("\nℹ️  Cashback scale is zero — nothing to claim for losers on this challenge.\n");
    return;
  }

  // Optional: quick estimate (safe, read-only)
  const [mySuccess, myFail] = await cp.contribOf(id, me);
  const losingPrincipal = snap.success ? BigInt(myFail) : BigInt(mySuccess);
  const est = (losingPrincipal * BigInt(snap.perLoserCashbackX)) / 10n ** 18n;
  console.log("Estimated cashback (if not already claimed):", ethers.formatUnits(est, 18));

  // Feature-detect function
  const hasClaim =
    (cp.interface && typeof (cp.interface as any).getFunction === "function" &&
      ((cp.interface as any).getFunction("claimLoserCashback(uint256)") ||
       (cp.interface as any).functions?.["claimLoserCashback(uint256)"])) ||
    (cp as any).claimLoserCashback;

  if (!hasClaim) {
    console.log(
      "\nℹ️  This contract build appears to use PUSH payouts on finalize().\n" +
      "    There is no claimLoserCashback() function to call — losers were already paid (or received 0 if none).\n"
    );
    return;
  }

  const tx = await (cp as any).claimLoserCashback(id);
  info("Tx", tx.hash);
  const rec = await tx.wait();
  info("Block", rec.blockNumber);
  console.log("\n✅ Loser cashback claim executed.\n");
}

main().catch(fail);