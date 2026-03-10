// scripts/debug/read-forwarder.ts
import { ethers } from "hardhat";

async function main() {
  const challengePay = process.env.CHALLENGE_PAY!;
  const cp = await ethers.getContractAt("ChallengePay", challengePay);
  console.log("trustedForwarder =", await cp.trustedForwarder());
}

main().catch(console.error);