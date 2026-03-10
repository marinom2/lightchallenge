// scripts/ops/setMockApproval.ts
import "@nomicfoundation/hardhat-ethers";
import hre from "hardhat";
const { ethers, network } = hre;
import fs from "fs";
import path from "path";

/** Parse truthy envs: true|1|yes|y, falsy: false|0|no|n */
function parseBool(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  throw new Error(`APPROVED must be true|false (got: ${v})`);
}

function loadVerifierFromDeps(): string {
  const p = path.join("deployments", `${network.name}.json`);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}. Deploy the mock first or set MOCK_ADDR.`);
  const dep = JSON.parse(fs.readFileSync(p, "utf8"));
  const addr = dep.mockVerifier || dep.MockProofVerifier || dep.verifier;
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error(`mockVerifier not found in ${p}. Found keys: ${Object.keys(dep).join(", ")}`);
  }
  return addr;
}

async function main() {
  console.log(`
================================================================================
MockProofVerifier: setApproved(challengeId, subject, ok)
================================================================================
`.trim());

  const mockAddr = process.env.MOCK_ADDR || loadVerifierFromDeps();

  const idStr = process.env.CH_ID;
  if (!idStr || !/^\d+$/.test(idStr)) throw new Error("CH_ID must be an integer.");
  const id = BigInt(idStr);

  const approved = parseBool(process.env.APPROVED ?? "true");

  const [signer] = await ethers.getSigners();
  const defaultSubject = await signer.getAddress();
  const subject = process.env.SUBJECT || defaultSubject;
  if (!/^0x[0-9a-fA-F]{40}$/.test(subject)) throw new Error("SUBJECT must be a valid hex address.");

  console.log("Network   :", network.name);
  console.log("Sender    :", await signer.getAddress());
  console.log("Verifier  :", mockAddr);
  console.log("CH_ID     :", idStr);
  console.log("SUBJECT   :", subject);
  console.log("APPROVED  :", approved);

  const mock = await ethers.getContractAt("MockProofVerifier", mockAddr, signer);
  const tx = await mock.setApproved(id, subject, approved);
  const rec = await tx.wait();

  console.log("Tx Hash   :", tx.hash);
  if (rec) console.log("Block     :", rec.blockNumber);
  console.log("\n✅ setApproved executed.\n");
}

main().catch((e) => {
  console.error(e?.stack || e?.message || String(e));
  process.exit(1);
});