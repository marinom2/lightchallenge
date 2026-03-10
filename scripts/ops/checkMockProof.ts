// scripts/ops/checkMockProof.ts
import "@nomicfoundation/hardhat-ethers";
import hre from "hardhat";
const { ethers, network } = hre;
import fs from "fs";
import path from "path";

function loadVerifier(): string {
  const p = path.join("deployments", `${network.name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}. Deploy the mock first.`);
  const dep = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!dep.mockVerifier) throw new Error("mockVerifier not found in deployments file.");
  return dep.mockVerifier;
}

async function main() {
  console.log(`
================================================================================
MockProofVerifier: verify(challengeId, subject, proof)
================================================================================
`);

  // Read envs
  const idStr = process.env.CH_ID;
  const subject = process.env.SUBJECT;
  const proofHex = process.env.PROOF ?? "0x";

  if (!idStr || !/^\d+$/.test(idStr)) throw new Error("CH_ID must be an integer.");
  if (!subject || !/^0x[0-9a-fA-F]{40}$/.test(subject))
    throw new Error("SUBJECT must be a valid hex address.");

  const id = BigInt(idStr);
  const mockAddr = loadVerifier();
  const [reader] = await ethers.getSigners();

  console.log("Network   :", network.name);
  console.log("Reader    :", await reader.getAddress());
  console.log("Verifier  :", mockAddr);
  console.log("CH_ID     :", idStr);
  console.log("SUBJECT   :", subject);
  console.log("PROOF     :", proofHex);

  const mock = await ethers.getContractAt("MockProofVerifier", mockAddr, reader);
  const ok = await mock.verify(id, subject, proofHex);
  console.log("verify()  :", ok ? "✅ TRUE" : "❌ FALSE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});