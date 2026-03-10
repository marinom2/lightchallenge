import * as hre from "hardhat";
const { ethers, network } = hre;
import crypto from "node:crypto";

async function main() {
  const { ROUTER, EVENT_TITLE, EVENT_ID } = process.env;
  if (!ROUTER) throw new Error("Set ROUTER address");
  const router = await ethers.getContractAt("EventChallengeRouter", ROUTER);
  const title = EVENT_TITLE || "Untitled Event";
  const eid = EVENT_ID ? EVENT_ID as `0x${string}` : ("0x"+crypto.createHash("sha256").update(title).digest("hex")) as `0x${string}`;
  const tx = await router.registerEvent(eid, title);
  await tx.wait();
  console.log("Event registered:", { eventId: eid, title });
}

main().catch(e => { console.error(e); process.exit(1); });
