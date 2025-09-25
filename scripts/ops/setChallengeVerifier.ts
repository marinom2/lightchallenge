import { ethers } from "hardhat";
import fs from "node:fs";

async function main() {
  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const dep = JSON.parse(fs.readFileSync(`deployments/${net}.json`, "utf8"));
  const cpAddr = dep.ChallengePay || dep.challengePay;
  if (!cpAddr) throw new Error("ChallengePay address missing in deployments");

  const id = BigInt(process.env.CH_ID || "0");
  const verifier = process.env.VERIFIER as `0x${string}`;
  const proofRequired = (process.env.REQ || "true") === "true";

  const cp = await ethers.getContractAt("ChallengePay", cpAddr);
  // Update via an admin function you already have or re-create with desired params.
  // If you don't have an update entrypoint, pass verifier+flag at createChallenge time.
  const tx = await cp.setProofConfig(id, proofRequired, verifier); // <== if missing, add a tiny admin setter.
  console.log("tx:", tx.hash);
  await tx.wait();
}
main().catch((e) => { console.error(e); process.exit(1); });