import { ethers, network } from "hardhat";

const CHALLENGE_PAY = "0x98E225E40A353899bBCcD51C26246dFF64CbE85d";

async function main() {
  console.log(`Network: ${network.name} (chainId=${network.config.chainId})`);

  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const cp = await ethers.getContractAt("ChallengePay", CHALLENGE_PAY);
  const id = process.env.ID ? BigInt(process.env.ID) : ((await cp.nextChallengeId()) - 1n);

  console.log("Approving challengeId:", id.toString());

  // dry run first (this will revert with reason if you can't approve)
  await cp.approveChallenge.staticCall(id, true);

  const tx = await cp.approveChallenge(id, true, { gasLimit: 2_000_000 });
  console.log("tx:", tx.hash);

  const r = await tx.wait();
  console.log("status:", r.status);
  console.log("gasUsed:", r.gasUsed.toString());
}

main().catch((e) => {
  console.error("FAILED:", e?.shortMessage ?? e?.message ?? e);
  process.exitCode = 1;
});