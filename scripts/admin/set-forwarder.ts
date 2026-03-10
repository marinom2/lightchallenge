// scripts/admin/set-forwarder.ts
import { ethers } from "hardhat";

async function main() {
  const challengePay = process.env.CHALLENGE_PAY;
  const forwarder = process.env.TRUSTED_FORWARDER;

  if (!challengePay || !forwarder) {
    throw new Error("Set env vars: CHALLENGE_PAY and TRUSTED_FORWARDER");
  }

  const [signer] = await ethers.getSigners();
  console.log("Admin signer:", signer.address);
  console.log("ChallengePay:", challengePay);
  console.log("Forwarder:", forwarder);

  const cp = await ethers.getContractAt("ChallengePay", challengePay, signer);

  const tx = await cp.setTrustedForwarder(forwarder);
  console.log("tx sent:", tx.hash);
  const rc = await tx.wait();
  console.log("confirmed in block:", rc?.blockNumber);

  const setValue = await cp.trustedForwarder();
  console.log("trustedForwarder now =", setValue);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});