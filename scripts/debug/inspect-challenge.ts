import { ethers, network } from "hardhat";

const CHALLENGE_PAY = "0x98E225E40A353899bBCcD51C26246dFF64CbE85d";

async function main() {
  console.log(`Network: ${network.name} (chainId=${network.config.chainId})`);
  const cp = await ethers.getContractAt("ChallengePay", CHALLENGE_PAY);

  const idArg = process.env.ID;
  const id = idArg ? BigInt(idArg) : ((await cp.nextChallengeId()) - 1n);

  const c: any = await cp.getChallenge(id);

  // NOTE: getChallenge likely returns a "view struct" – print it raw first.
  console.log("challengeId:", id.toString());
  console.log("raw getChallenge:", c);

  // Common fields (if present)
  const now = Math.floor(Date.now() / 1000);
  console.log("local now:", now);

  // Try to print typical properties safely
  const safe = (k: string) => (c?.[k] !== undefined ? c[k] : "<n/a>");
  console.log("status:", safe("status"));
  console.log("outcome:", safe("outcome"));
  console.log("challenger:", safe("challenger"));
  console.log("approvalDeadline:", safe("approvalDeadline"));
  console.log("startTs:", safe("startTs"));
  console.log("duration:", safe("duration"));
  console.log("proofRequired:", safe("proofRequired"));
  console.log("proofOk:", safe("proofOk"));
}

main().catch((e) => {
  console.error("FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exitCode = 1;
});