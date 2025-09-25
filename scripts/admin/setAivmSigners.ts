import { ethers } from "hardhat";

async function main() {
  const verifier = process.env.AIVM_VERIFIER as string;
  if (!verifier) throw new Error("Set AIVM_VERIFIER in env");

  const signers = (process.env.AIVM_SIGNERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (signers.length === 0) throw new Error("Set AIVM_SIGNERS=0x...");

  const v = await ethers.getContractAt("AivmProofVerifier", verifier);
  for (const s of signers) {
    const tx = await v.addAivmSigner(s);
    await tx.wait();
    console.log("Added signer:", s);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
