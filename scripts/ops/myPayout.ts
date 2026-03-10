// scripts/inspect/myPayout.ts
//
// Shows a wallet's contributions and estimated payouts for a challenge.
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> [WHO=<addr>] \
//   npx hardhat run scripts/inspect/myPayout.ts --network <yourNet>
//
import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";
const { ethers, network } = hre;

function fmt(n: bigint | number) { return (typeof n === "bigint" ? n : BigInt(n)).toString(); }

async function main() {
  const addr = process.env.ADDR;
  const chIdEnv = process.env.CH_ID ?? "";
  if (!addr) throw new Error("Set ADDR=<ChallengePay address>");
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const [signer] = await ethers.getSigners();
  const me = await signer.getAddress();
  const who = (process.env.WHO || me).toLowerCase();

  const cp = await ethers.getContractAt("ChallengePay", addr, signer);

  console.log("— ChallengePay: My Payout —");
  console.log("Network:", network.name);
  console.log("Contract:", addr);
  console.log("Viewing wallet:", who);
  console.log("Challenge:", id.toString());
  console.log("");

  const ch = await cp.getChallenge(id);
  console.log("Status:", Number(ch.status), "(0=Pending,1=Approved,2=Rejected,3=Finalized)");
  console.log("Outcome:", Number(ch.outcome), "(0=None,1=Success,2=Fail)");
  console.log("");

  const snap = await cp.getSnapshot(id);
  if (!snap.set) {
    console.log("Snapshot not set — no final payout math yet.");
    console.log("Pools (pre-snapshot view): success", fmt(ch.poolSuccess), "fail", fmt(ch.poolFail));
    return;
  }

  const contrib = await cp.contribOf(id, who);
  const mySuccess = BigInt(contrib[0]);
  const myFail = BigInt(contrib[1]);
  const success = snap.success as boolean;

  const perWinnerBonusX = BigInt(snap.perWinnerBonusX);
  const perLoserCashbackX = BigInt(snap.perLoserCashbackX);

  const myWinnerPrincipal = success ? mySuccess : myFail;
  const myLoserPrincipal  = success ? myFail : mySuccess;

  let estWinner = 0n;
  if (myWinnerPrincipal > 0n) {
    estWinner = myWinnerPrincipal;
    if (perWinnerBonusX > 0n) {
      estWinner += (myWinnerPrincipal * perWinnerBonusX) / 10n**18n;
    }
  }

  let estCashback = 0n;
  if (myLoserPrincipal > 0n && perLoserCashbackX > 0n) {
    estCashback = (myLoserPrincipal * perLoserCashbackX) / 10n**18n;
  }

  console.log("Snapshot set:", snap.set, "success:", success);
  console.log("perWinnerBonusX:", fmt(perWinnerBonusX), "(1e18 scale)");
  console.log("perLoserCashbackX:", fmt(perLoserCashbackX), "(1e18 scale)");
  console.log("");
  console.log("Your principals:");
  console.log("  onSuccessSide:", fmt(mySuccess));
  console.log("  onFailSide   :", fmt(myFail));
  console.log("");
  console.log("Estimated (if not already claimed):");
  console.log("  Winner claim:   ", fmt(estWinner));
  console.log("  Loser cashback: ", fmt(estCashback));
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});