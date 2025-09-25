import { ethers } from "hardhat";

async function main() {
  const { ROUTER, EVENT_ID, WINNER_INDEX, PROOF_HEX } = process.env;
  if (!ROUTER || !EVENT_ID || WINNER_INDEX == null || !PROOF_HEX) {
    throw new Error("Set ROUTER, EVENT_ID, WINNER_INDEX, PROOF_HEX");
  }
  const router = await ethers.getContractAt("EventChallengeRouter", ROUTER);
  const tx = await router.finalizeEvent(EVENT_ID as `0x${string}`, Number(WINNER_INDEX), PROOF_HEX as `0x${string}`);
  const rc = await tx.wait();
  console.log("Event finalized:", { EVENT_ID, WINNER_INDEX, tx: rc?.hash });
}

main().catch(e => { console.error(e); process.exit(1); });
