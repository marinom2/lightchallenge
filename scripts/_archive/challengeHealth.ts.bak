// scripts/inspect/challengeHealth.ts
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> npx hardhat run scripts/inspect/challengeHealth.ts --network lightchain
//
// Examples:
//   ADDR=0xabc... CH_ID=12 npx hardhat run scripts/inspect/challengeHealth.ts --network lightchain
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
  if (!addr) throw new Error("Set ADDR=<ChallengePay address>");
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const [signer] = await ethers.getSigners();
  const cp = await ethers.getContractAt("ChallengePay", addr, signer);
  const me = await signer.getAddress();

  console.log("— ChallengePay Health —");
  console.log("Network:", network.name);
  console.log("Contract:", addr);
  console.log("Signer:", me);
  console.log("Challenge:", id.toString());
  console.log("");

  // Basic challenge view
  const ch = await cp.getChallenge(id);
  const status = Number(ch.status);   // 0 Pending, 1 Approved, 2 Rejected, 3 Finalized
  const outcome = Number(ch.outcome); // 0 None, 1 Success, 2 Fail

  console.log("Status:", status, "(0=Pending,1=Approved,2=Rejected,3=Finalized)");
  console.log("Outcome:", outcome, "(0=None,1=Success,2=Fail)");
  console.log("Pools:", {
    poolSuccess: fmt(ch.poolSuccess),
    poolFail: fmt(ch.poolFail),
  });
  console.log("Peers:", ch.peers.length, "needed:", ch.peerApprovalsNeeded);
  console.log("Approvals:", {
    yesWeight: fmt(ch.yesWeight),
    noWeight: fmt(ch.noWeight),
    partWeight: fmt(ch.partWeight),
  });
  console.log("");

  // Snapshot (finalized path) view
  const snap = await cp.getSnapshot(id);
  const hasSnap = snap.set;
  console.log("Snapshot set:", hasSnap);
  if (hasSnap) {
    console.log("  success:", snap.success);
    console.log("  rightSide:", Number(snap.rightSide), "(0=None,1=Approval,2=Reject)");
    console.log("  eligibleValidators:", Number(snap.eligibleValidators));
    console.log("  winnersPool:", fmt(snap.winnersPool));
    console.log("  losersPool:", fmt(snap.losersPool));
    console.log("  loserCashback:", fmt(snap.loserCashback));
    console.log("  losersAfterCashback:", fmt(snap.losersAfterCashback));
    console.log("  charityAmt:", fmt(snap.charityAmt));
    console.log("  daoAmt:", fmt(snap.daoAmt));
    console.log("  creatorAmt:", fmt(snap.creatorAmt));
    console.log("  validatorsAmt:", fmt(snap.validatorsAmt));
    console.log("  perWinnerBonusX:", fmt(snap.perWinnerBonusX), "(scaled 1e18)");
    console.log("  perLoserCashbackX:", fmt(snap.perLoserCashbackX), "(scaled 1e18)");
    console.log("  perValidatorAmt:", fmt(snap.perValidatorAmt));
  }
  console.log("");

  // Validator claim info for the connected account (or set VALIDATOR=<addr>)
  const who = process.env.VALIDATOR || me;
  const info = await cp.getValidatorClaimInfo(id, who);
  console.log("Validator claim info for:", who);
  console.log("  snapshotSet:", info.snapshotSet);
  console.log("  isRejected:", info.isRejected);
  console.log("  voted:", info.voted);
  console.log("  rightSide:", info.rightSide);
  console.log("  alreadyClaimedFinal:", info.alreadyClaimedFinal);
  console.log("  alreadyClaimedReject:", info.alreadyClaimedReject);
  console.log("  perValidatorFinal:", fmt(info.perValidatorFinal));
  console.log("  perValidatorReject:", fmt(info.perValidatorReject));

  const mode =
    info.snapshotSet && info.rightSide && !info.alreadyClaimedFinal && info.perValidatorFinal > 0n
      ? "finalized"
      : !info.snapshotSet && info.isRejected && info.voted && !info.alreadyClaimedReject && info.perValidatorReject > 0n
      ? "reject"
      : "none";

  console.log("");
  console.log("=> Suggested claim mode:", mode);
  if (mode === "finalized") {
    console.log("   Call: claimValidator(uint256)  // routes to claimValidatorReward()");
    console.log("   Amount:", fmt(info.perValidatorFinal));
  } else if (mode === "reject") {
    console.log("   Call: claimValidator(uint256)  // routes to claimValidatorReject()");
    console.log("   Amount:", fmt(info.perValidatorReject));
  } else {
    console.log("   Nothing claimable for this validator right now.");
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});