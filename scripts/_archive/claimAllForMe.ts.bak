// scripts/ops/claimAllForMe.ts
//
// Runs validator auto-claim and bettor auto-claim sequentially.
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> [DRY=1] \
//   npx hardhat run scripts/ops/claimAllForMe.ts --network <yourNet>
//
import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";
const { run } = hre;

async function main() {
  console.log("— ChallengePay: Claim ALL —");
  const DRY = process.env.DRY === "1" || process.env.DRY === "true";

  console.log("\n[1/2] Validator auto-claim…");
  try {
    // Reuse the script in-process
    await run("run", { script: "scripts/ops/claimAuto.ts" });
  } catch (e) {
    console.log("Validator auto-claim step finished with message:", (e as any)?.message || e);
  }

  console.log("\n[2/2] Bettor auto-claim…");
  try {
    await run("run", { script: "scripts/ops/claimBettor.ts" });
  } catch (e) {
    console.log("Bettor auto-claim step finished with message:", (e as any)?.message || e);
  }

  console.log(`\n✅ Done. ${DRY ? "(DRY mode: no transactions were sent.)" : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});