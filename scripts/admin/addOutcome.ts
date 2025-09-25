import { ethers } from "hardhat";

async function main() {
  const { ROUTER, EVENT_ID, NAME, CHALLENGE_ID, SUBJECT } = process.env;
  if (!ROUTER || !EVENT_ID || !NAME || !CHALLENGE_ID || !SUBJECT) {
    throw new Error("Set ROUTER, EVENT_ID, NAME, CHALLENGE_ID, SUBJECT");
  }
  const router = await ethers.getContractAt("EventChallengeRouter", ROUTER);
  const tx = await router.addOutcome(EVENT_ID as `0x${string}`, NAME, BigInt(CHALLENGE_ID), SUBJECT);
  await tx.wait();
  console.log("Outcome added:", { EVENT_ID, NAME, CHALLENGE_ID, SUBJECT });
}

main().catch(e => { console.error(e); process.exit(1); });
