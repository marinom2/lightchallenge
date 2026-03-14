// scripts/ops/claimAuto.ts
//
// Auto-claims the correct validator reward for the connected wallet.
// Works with the enhanced ChallengePay that includes getValidatorClaimInfo().
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> [DRY=1] [VALIDATOR=<addr>] \
//   npx hardhat run scripts/ops/claimAuto.ts --network <yourNet>
//
// Notes:
// - DRY=1 will only show what it *would* do, without sending a tx.
// - VALIDATOR is only for inspecting a different address; the claim is
//   always executed by the connected signer (you).
//
import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";
const { ethers, network } = hre;

function fmt(n: bigint | number): string {
  const b = typeof n === "bigint" ? n : BigInt(n);
  return b.toString();
}

async function main() {
  const addr = process.env.ADDR;
  const chIdEnv = process.env.CH_ID ?? "";
  const DRY = process.env.DRY === "1" || process.env.DRY === "true";
  if (!addr) throw new Error("Set ADDR=<ChallengePay address>");
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const [signer] = await ethers.getSigners();
  const cp = await ethers.getContractAt("ChallengePay", addr, signer);
  const me = await signer.getAddress();
  const who = process.env.VALIDATOR || me;

  console.log("— ChallengePay Auto-Claim —");
  console.log("Network:", network.name);
  console.log("Contract:", addr);
  console.log("Signer:", me);
  console.log("Validator (inspecting):", who);
  console.log("Challenge:", id.toString());
  console.log("Dry-run:", DRY ? "yes" : "no");
  console.log("");

  // Read challenge to show status context (optional)
  const ch = await cp.getChallenge(id);
  const status = Number(ch.status);   // 0 Pending, 1 Approved, 2 Rejected, 3 Finalized
  const outcome = Number(ch.outcome); // 0 None, 1 Success, 2 Fail
  console.log("Status:", status, "(0=Pending,1=Approved,2=Rejected,3=Finalized)");
  console.log("Outcome:", outcome, "(0=None,1=Success,2=Fail)");
  console.log("");

  // Use the helper to decide the mode + amounts
  // tuple: (snapshotSet, isRejected, voted, rightSide, alreadyClaimedFinal, alreadyClaimedReject, perValidatorFinal, perValidatorReject)
  const info = await cp.getValidatorClaimInfo(id, who);
  const snapshotSet          = info[0] as boolean;
  const isRejected           = info[1] as boolean;
  const voted                = info[2] as boolean;
  const rightSide            = info[3] as boolean;
  const alreadyClaimedFinal  = info[4] as boolean;
  const alreadyClaimedReject = info[5] as boolean;
  const perValidatorFinal    = BigInt(info[6]);
  const perValidatorReject   = BigInt(info[7]);

  console.log("snapshotSet:", snapshotSet);
  console.log("isRejected:", isRejected);
  console.log("voted:", voted);
  console.log("rightSide:", rightSide);
  console.log("alreadyClaimedFinal:", alreadyClaimedFinal);
  console.log("alreadyClaimedReject:", alreadyClaimedReject);
  console.log("perValidatorFinal:", fmt(perValidatorFinal));
  console.log("perValidatorReject:", fmt(perValidatorReject));
  console.log("");

  // Determine what to do
  const canFinalized =
    snapshotSet && rightSide && !alreadyClaimedFinal && perValidatorFinal > 0n;

  const canReject =
    !snapshotSet && isRejected && voted && !alreadyClaimedReject && perValidatorReject > 0n;

  if (!canFinalized && !canReject) {
    console.log("Nothing to claim for this validator right now.");
    if (!voted) console.log("• You didn’t vote on this challenge.");
    if (snapshotSet && !rightSide) console.log("• Snapshot set but you didn’t vote on the right side.");
    if (alreadyClaimedFinal || alreadyClaimedReject) console.log("• Reward already claimed.");
    if (perValidatorFinal === 0n && perValidatorReject === 0n) console.log("• Per-validator amount is zero.");
    return;
  }

  // We can call the single facade entry — it auto-routes:
  // - snapshot present -> claimValidatorReward
  // - otherwise -> claimValidatorReject
  console.log("Calling: claimValidator(", id.toString(), ")");
  if (DRY) {
    console.log("DRY-RUN: would submit tx now. Skipping send.");
    return;
  }

  const tx = await cp.claimValidator(id);
  console.log("Tx:", tx.hash);
  const rec = await tx.wait();
  console.log("Included in block:", rec.blockNumber);
  console.log("✅ Claim executed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});