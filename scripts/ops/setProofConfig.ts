import { ethers } from "hardhat";
import fs from "node:fs";
import path from "node:path";

/**
 * Points a challenge at a verifier and toggles proofRequired.
 *
 * ENV:
 *   HARDHAT_NETWORK   = <your network>
 *   CH_ID             = <challenge id>
 *   CHALLENGEPAY      = 0x... (optional; else read from deployments/<net>.json)
 *   VERIFIER          = 0x... (ZkProofVerifier or MultiSigProofVerifier)
 *   REQUIRED          = true|false  (default: true)
 */

function readDeployAddress(net: string, key: string): string | undefined {
  try {
    const p = path.join("deployments", `${net}.json`);
    const js = JSON.parse(fs.readFileSync(p, "utf8"));
    return js[key] || js[key[0].toLowerCase() + key.slice(1)];
  } catch {
    return undefined;
  }
}

async function main() {
  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const cpAddr =
    process.env.CHALLENGEPAY ||
    readDeployAddress(net, "ChallengePay") ||
    readDeployAddress(net, "challengePay");

  if (!cpAddr) throw new Error("ChallengePay address missing (set CHALLENGEPAY or deployments/<net>.json)");

  const idStr = process.env.CH_ID;
  if (!idStr) throw new Error("CH_ID env is required");
  const id = BigInt(idStr);

  const verifier = process.env.VERIFIER as `0x${string}`;
  if (!verifier) throw new Error("VERIFIER env is required (address of ZkProofVerifier or MultiSigProofVerifier)");

  const required = (process.env.REQUIRED || "true").toLowerCase() === "true";

  const cp = await ethers.getContractAt("ChallengePay", cpAddr);
  const tx = await cp.setProofConfig(id, required, verifier);
  console.log("setProofConfig tx:", tx.hash);
  await tx.wait();

  console.log(
    `✅ Challenge ${id.toString()} updated:
proofRequired=${required}
verifier=${verifier}
on ChallengePay ${cpAddr}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});