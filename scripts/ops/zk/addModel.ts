import hre from "hardhat";
const { ethers } = hre;;
import fs from "node:fs";

function hashStr(s: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(s));
}

async function main() {
  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const dep = JSON.parse(fs.readFileSync(`deployments/${net}.json`, "utf8"));
  const zkAddr = process.env.ZK_ADDR || dep.zkProofVerifier;
  if (!zkAddr) throw new Error("ZK verifier address missing");

  const modelLabel = process.env.MODEL || "steps-circuit@1.0.0";
  const modelHash = process.env.MODEL_HASH || hashStr(modelLabel);
  const verifier = process.env.PLONK_VERIFIER || process.env.PlonkVerifier || process.env.VERIFIER;
  if (!verifier) throw new Error("Provide PLONK verifier address via VERIFIER env var");

  const enforce = (process.env.BINDING || "true") === "true";

  const zk = await ethers.getContractAt("ZkProofVerifier", zkAddr);
  const tx = await zk.setModel(modelHash as `0x${string}`, verifier as `0x${string}`, true, enforce);
  console.log("setModel tx:", tx.hash);
  await tx.wait();
  console.log("Model set:", modelLabel, modelHash, "verifier:", verifier, "binding:", enforce);
}
main().catch((e) => { console.error(e); process.exit(1); });