// scripts/inspect/pools.ts
//
// Prints Success/Fail pools, participants and peer/validator approvals snapshot.
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> \
//   npx hardhat run scripts/inspect/pools.ts --network <net>
import hre from "hardhat";
const { ethers, network } = hre;

function fmt(n: bigint | number) {
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
  const cp = await ethers.getContractAt("ChallengePay", addr, signer);

  console.log("— ChallengePay: Pools View —");
  console.log("Network:", network.name);
  console.log("Contract:", addr);
  console.log("Challenge:", id.toString());
  console.log("");

  const ch = await cp.getChallenge(id);
  console.log("Status:", Number(ch.status), "(0=Pending,1=Approved,2=Rejected,3=Finalized)");
  console.log("Outcome:", Number(ch.outcome), "(0=None,1=Success,2=Fail)");
  console.log("Pools:  Success =", fmt(ch.poolSuccess), " | Fail =", fmt(ch.poolFail));
  console.log("Participants:", Number(ch.participantsCount));
  console.log("Peers needed:", Number(ch.peerApprovalsNeeded), " | approvals:", Number(ch.peerApprovals), "rejections:", Number(ch.peerRejections));
  console.log("Validator approvals (stake-weighted): yes =", fmt(ch.yesWeight), " no =", fmt(ch.noWeight), " part =", fmt(ch.partWeight));
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});