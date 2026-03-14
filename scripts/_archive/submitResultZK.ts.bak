import hre from "hardhat";
const { ethers } = hre;;
import fs from "node:fs";
import path from "node:path";

/**
 * Submits a zk proof to ChallengePay.submitProof(challengeId, proofBytes).
 *
 * ENV:
 *   HARDHAT_NETWORK   = <your network>
 *   CH_ID             = <challenge id number>
 *   CHALLENGEPAY      = 0x... (optional; otherwise read from deployments/<net>.json)
 *   MODEL             = steps-circuit@1.0.0  (optional)
 *   MODEL_HASH        = 0x... (optional; overrides MODEL)
 *   PROOF_DATA_HEX    = 0x... (required; PLONK proof bytes)
 *   PUBSIGS_CSV       = "0x...,0x...,123,..." (required; public signals array)
 *
 * NOTES:
 * - If your ZkProofVerifier has enforceBinding=true, PUBSIGS_CSV[0] must equal
 *   uint256(keccak256(abi.encode(challengeId, subject))), where `subject` is the
 *   challenge creator address your verifier expects. (In your current contract,
 *   submitProof passes `c.challenger` as the subject.)
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

  const chIdStr = process.env.CH_ID;
  if (!chIdStr) throw new Error("CH_ID env is required");
  const challengeId = BigInt(chIdStr);

  const modelLabel = process.env.MODEL || "steps-circuit@1.0.0";
  const modelHash =
    (process.env.MODEL_HASH as `0x${string}`) ||
    (ethers.keccak256(ethers.toUtf8Bytes(modelLabel)) as `0x${string}`);

  const proofDataHex = process.env.PROOF_DATA_HEX as `0x${string}`;
  if (!proofDataHex || !proofDataHex.startsWith("0x")) throw new Error("PROOF_DATA_HEX must be hex (0x...)");

  const pubCsv = process.env.PUBSIGS_CSV;
  if (!pubCsv) throw new Error("PUBSIGS_CSV is required (comma-separated array of uint256/hex)");

  // Parse public signals. Accept hex (0x...) or decimal strings.
  const publicSignals = pubCsv.split(",").map((s) => s.trim()).map((v) => {
    if (v.startsWith("0x") || v.startsWith("0X")) return v;
    // decimal → hex uint256
    return ethers.toBeHex(BigInt(v));
  });

  const abi = ethers.AbiCoder.defaultAbiCoder();
  const proofBytes = abi.encode(
    ["bytes32", "bytes", "uint256[]"],
    [modelHash, proofDataHex, publicSignals]
  );

  const cp = await ethers.getContractAt("ChallengePay", cpAddr);
  const tx = await cp.submitProof(challengeId, proofBytes);
  console.log("submitProof tx:", tx.hash);
  await tx.wait();
  console.log(
    `✅ Submitted proof to ChallengePay ${cpAddr} for challenge #${challengeId}
Model: ${modelLabel} (${modelHash})
pubSignals[0..]: ${publicSignals.join(", ")}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});