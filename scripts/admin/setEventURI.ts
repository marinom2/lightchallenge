import * as hre from "hardhat";
const { ethers } = hre;

async function main() {
  const { ROUTER, EVENT_ID, URI } = process.env;
  if (!ROUTER || !EVENT_ID || !URI) throw new Error("Set ROUTER, EVENT_ID, URI");
  const router = await ethers.getContractAt("EventChallengeRouter", ROUTER);
  const tx = await router.setEventURI(EVENT_ID as `0x${string}`, URI);
  await tx.wait();
  console.log("Event URI set:", { EVENT_ID, URI });
}

main().catch(e => { console.error(e); process.exit(1); });
