// scripts/ops/claimBettor.ts
//
// Auto-claims bettor payouts for the connected wallet:
//  - claimWinner() if you have principal on the winning side
//  - claimLoserCashback() if you have principal on the losing side (and cashback>0)
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> [DRY=1] [WHO=<addr>] \
//   npx hardhat run scripts/ops/claimBettor.ts --network <yourNet>
//
// Notes:
// - WHO is for inspecting a different wallet, but *claims are executed by the signer*.
// - Works with the enhanced ChallengePay (read-only helpers optional).
//
import hardhat from "hardhat";
import "@nomicfoundation/hardhat-ethers";
const { ethers, network } = hardhat;

function fmt(n: bigint | number) { return (typeof n === "bigint" ? n : BigInt(n)).toString(); }

async function main() {
  const addr = process.env.ADDR;
  const chIdEnv = process.env.CH_ID ?? "";
  const DRY = process.env.DRY === "1" || process.env.DRY === "true";
  if (!addr) throw new Error("Set ADDR=<ChallengePay address>");
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const [signer] = await ethers.getSigners();
  const me = await signer.getAddress();
  const who = (process.env.WHO || me).toLowerCase();

  const cp = await ethers.getContractAt("ChallengePay", addr, signer);

  console.log("— ChallengePay Bettor Auto-Claim —");
  console.log("Network:", network.name);
  console.log("Contract:", addr);
  console.log("Signer:", me);
  console.log("Inspecting wallet:", who);
  console.log("Challenge:", id.toString());
  console.log("Dry-run:", DRY ? "yes" : "no");
  console.log("");

  // Need a snapshot (finalized path) to claim bettor payouts
  const snap = await cp.getSnapshot(id);
  if (!snap.set) {
    console.log("Snapshot not set yet — bettor claims are not available.");
    console.log("Tip: finalize must run and snapshot must be set.");
    return;
  }

  const success = snap.success as boolean;
  const perWinnerBonusX = BigInt(snap.perWinnerBonusX);
  const perLoserCashbackX = BigInt(snap.perLoserCashbackX);

  const contrib = await cp.contribOf(id, who);
  const mySuccess = BigInt(contrib[0]);
  const myFail = BigInt(contrib[1]);

  // Figure out which side is winner/loser for this wallet
  const myWinnerPrincipal = success ? mySuccess : myFail;
  const myLoserPrincipal  = success ? myFail : mySuccess;

  console.log("Snapshot:");
  console.log("  success:", success);
  console.log("  perWinnerBonusX:", fmt(perWinnerBonusX), "(1e18 scale)");
  console.log("  perLoserCashbackX:", fmt(perLoserCashbackX), "(1e18 scale)");
  console.log("Your principals:");
  console.log("  onSuccessSide:", fmt(mySuccess));
  console.log("  onFailSide   :", fmt(myFail));
  console.log("");

  // Winner claim estimation (principal + bonus)
  let estWinner = 0n;
  if (myWinnerPrincipal > 0n) {
    estWinner = myWinnerPrincipal;
    if (perWinnerBonusX > 0n) {
      estWinner += (myWinnerPrincipal * perWinnerBonusX) / 10n**18n;
    }
  }

  // Loser cashback estimation
  let estCashback = 0n;
  if (myLoserPrincipal > 0n && perLoserCashbackX > 0n) {
    estCashback = (myLoserPrincipal * perLoserCashbackX) / 10n**18n;
  }

  console.log("Estimated payouts (if not already claimed):");
  console.log("  Winner claim:   ", fmt(estWinner));
  console.log("  Loser cashback: ", fmt(estCashback));
  console.log("");

  // Attempt winner claim (if eligible)
  if (myWinnerPrincipal > 0n && estWinner > 0n) {
    console.log("→ Winner path eligible. Calling claimWinner(", id.toString(), ")");
    if (!DRY) {
      try {
        const tx = await cp.claimWinner(id);
        console.log("  Tx:", tx.hash);
        const rec = await tx.wait();
        console.log("  Included in block:", rec.blockNumber);
      } catch (e: any) {
        const msg = (e?.error?.message || e?.message || "").toLowerCase();
        if (msg.includes("alreadyclaimed")) {
          console.log("  Already claimed winner payout — skipping.");
        } else if (msg.includes("noteligible")) {
          console.log("  Not eligible for winner payout — skipping.");
        } else {
          console.log("  Winner claim failed:", e?.message || e);
        }
      }
    } else {
      console.log("  DRY-RUN: skipping tx send.");
    }
  } else {
    console.log("→ Winner path not eligible or zero amount — skipping.");
  }

  // Attempt loser cashback (if eligible)
  if (myLoserPrincipal > 0n && perLoserCashbackX > 0n && estCashback > 0n) {
    console.log("→ Loser cashback eligible. Calling claimLoserCashback(", id.toString(), ")");
    if (!DRY) {
      try {
        const tx2 = await cp.claimLoserCashback(id);
        console.log("  Tx:", tx2.hash);
        const rec2 = await tx2.wait();
        console.log("  Included in block:", rec2.blockNumber);
      } catch (e: any) {
        const msg = (e?.error?.message || e?.message || "").toLowerCase();
        if (msg.includes("alreadyclaimed")) {
          console.log("  Already claimed loser cashback — skipping.");
        } else if (msg.includes("noteligible")) {
          console.log("  Not eligible for loser cashback — skipping.");
        } else {
          console.log("  Loser cashback failed:", e?.message || e);
        }
      }
    } else {
      console.log("  DRY-RUN: skipping tx send.");
    }
  } else {
    console.log("→ Loser cashback not eligible or zero amount — skipping.");
  }

  console.log("\n✅ Bettor auto-claim complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});