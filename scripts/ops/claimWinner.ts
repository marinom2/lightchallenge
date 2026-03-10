// scripts/ops/claimWinner.ts
import hre from "hardhat";
const { ethers } = hre;
import { context, header, info, fail } from "../dev/utils";

async function main() {
  header("Claim — Winner (principal + bonus)");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const me = await signer.getAddress();

  info("Network", net);
  info("Signer", me);
  info("Contract", addr);
  info("Challenge", id.toString());

  const snap = await cp.getSnapshot(id);
  if (!snap.set) {
    console.log("\nℹ️  Snapshot not set — winner claim is not available yet.\n");
    return;
  }

  // Optional: estimate (principal + bonus on winning side)
  const [mySuccess, myFail] = await cp.contribOf(id, me);
  const principal = snap.success ? BigInt(mySuccess) : BigInt(myFail);
  let est = principal;
  if (principal > 0n && BigInt(snap.perWinnerBonusX) > 0n) {
    est += (principal * BigInt(snap.perWinnerBonusX)) / 10n ** 18n;
  }
  console.log("Estimated winner payout (if not already claimed):", ethers.formatUnits(est, 18));

  // Feature-detect pull-claim API
  const hasClaim =
    (cp.interface && typeof (cp.interface as any).getFunction === "function" &&
      ((cp.interface as any).getFunction("claimWinner(uint256)") ||
       (cp.interface as any).functions?.["claimWinner(uint256)"])) ||
    (cp as any).claimWinner;

  if (!hasClaim) {
    console.log(
      "\nℹ️  This contract build appears to use PUSH payouts on finalize().\n" +
      "    There is no claimWinner() function to call — winners were already paid.\n"
    );
    return;
  }

  const tx = await (cp as any).claimWinner(id);
  info("Tx", tx.hash);
  const rec = await tx.wait();
  info("Block", rec.blockNumber);
  console.log("\n✅ Winner claim executed.\n");
}

main().catch(fail);