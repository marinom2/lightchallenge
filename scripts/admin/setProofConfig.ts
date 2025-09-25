import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers } = hardhat;

async function main() {
  const net = (process.env.HARDHAT_NETWORK || "lightchain");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dep = require(`../deployments/${net}.json`);
  const cp = await ethers.getContractAt("ChallengePay", dep.ChallengePay);

  const id = BigInt(process.env.ID || "0");
  const required = (process.env.REQUIRED || "0") === "1";
  const verifier = process.env.VERIFIER || ethers.ZeroAddress;

  if (required && verifier === ethers.ZeroAddress) {
    throw new Error("REQUIRED=1 but VERIFIER not set");
  }
  const tx = await cp.setProofConfig(id, required, verifier);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("✔ setProofConfig done");
}

main().catch((e) => { console.error(e); process.exit(1); });