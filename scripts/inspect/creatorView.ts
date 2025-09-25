// Shows the creator’s (challenger’s) payout context for a challenge.
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> [WHO=<addr>] \
//   npx hardhat run scripts/inspect/creatorView.ts --network <net>
//
import hardhat from "hardhat";
import "@nomicfoundation/hardhat-ethers";
const { ethers, network } = hardhat;

function fmt(n: bigint | number): string {
  const b = typeof n === "bigint" ? n : BigInt(n);
  return ethers.formatUnits(b, 18);
}

async function main() {
  const addr = process.env.ADDR;
  const chIdEnv = process.env.CH_ID ?? "";
  if (!addr) throw new Error("Set ADDR=<ChallengePay address>");
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const [signer] = await ethers.getSigners();
  const viewer = (process.env.WHO || (await signer.getAddress())).toLowerCase();
  const cp = await ethers.getContractAt("ChallengePay", addr, signer);

  console.log("— ChallengePay: Creator View —");
  console.log("Network:", network.name);
  console.log("Contract:", addr);
  console.log("Challenge:", id.toString());
  console.log("Viewer:", viewer);
  console.log("");

  const ch = await cp.getChallenge(id);
  const snapshot = await cp.getSnapshot(id);
  const status = Number(ch.status);   // 0 Pending, 1 Approved, 2 Rejected, 3 Finalized
  const outcome = Number(ch.outcome); // 0 None, 1 Success, 2 Fail

  const challenger = (ch.challenger as string).toLowerCase();
  console.log("Challenger:", ch.challenger, viewer !== challenger ? "(viewer ≠ challenger)" : "(you are the challenger)");
  console.log("Status:", status, "(0=Pending,1=Approved,2=Rejected,3=Finalized)");
  console.log("Outcome:", outcome, "(0=None,1=Success,2=Fail)");
  console.log("");

  if (snapshot.set) {
    // Finalized (Success or Fail): creator paid at snapshot time
    console.log("Snapshot set ✓");
    console.log("  success:", snapshot.success);
    console.log("  creatorAmt (paid at snapshot):", fmt(snapshot.creatorAmt));
    console.log("  daoAmt:", fmt(snapshot.daoAmt));
    console.log("  validatorsAmt:", fmt(snapshot.validatorsAmt));
    console.log("  charityAmt:", fmt(snapshot.charityAmt));
    console.log("  losersPool:", fmt(snapshot.losersPool));
    console.log("  losersAfterCashback:", fmt(snapshot.losersAfterCashback));
    return;
  }

  // No snapshot → either still in-flight or Rejected path
  if (status === 2 /* Rejected */) {
    console.log("Rejected path (no snapshot). Refunds/fees handled immediately on-chain.");

    // Read feeConfig (named fields in your ABI; if unnamed in some builds, tuple index fallback)
    const feeCfg: any = await cp.feeConfig();
    const rejectFeeBps: bigint = BigInt(feeCfg.rejectFeeBps ?? feeCfg[4]);
    const rejectDaoBps: bigint = BigInt(feeCfg.rejectDaoBps ?? feeCfg[5]);
    const rejectValidatorsBps: bigint = BigInt(feeCfg.rejectValidatorsBps ?? feeCfg[6]);

    console.log("Reject fee bps:", Number(rejectFeeBps));
    console.log("Reject split — DAO bps:", Number(rejectDaoBps), "Validators bps:", Number(rejectValidatorsBps));

    const currentStake = BigInt(ch.stake);
    const currentBond  = BigInt(ch.proposalBond);

    if (currentStake === 0n && currentBond === 0n) {
      console.log("\nStake & proposalBond are zeroed (refund likely already executed).");
      console.log("• Challenger received: (original stake + bond) - rejectFee, at refund time.");
      console.log("• DAO received its share of reject fee.");
      console.log("• Validators received equal per-cap if rejectValidatorsBps > 0 (claimable via claimValidator).");
    } else {
      const base = currentStake + currentBond;
      const fee  = (base * rejectFeeBps) / 10000n;
      const creatorNet = base - fee;
      console.log("\nPre-refund values (looks like not finalized/canceled yet):");
      console.log("  stake:", fmt(currentStake));
      console.log("  proposalBond:", fmt(currentBond));
      console.log("  base (stake+bond):", fmt(base));
      console.log("  rejectFee:", fmt(fee));
      console.log("  creatorNet (base - fee):", fmt(creatorNet));
    }

    try {
      const perCap = await cp.getRejectPerValidatorAmt(id);
      console.log("Per-validator reject-claim amount (if any):", fmt(perCap));
    } catch {
      // helper may not exist on older deployments
    }
    return;
  }

  console.log("No snapshot yet — challenge not finalized. No creator payout has been made.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});