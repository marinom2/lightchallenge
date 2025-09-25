const { ethers } = require("hardhat");

async function main() {
  const cpAddr = process.env.CP_ADDR;
  const zkAddr = process.env.ZK_ADDR;
  const chId = BigInt(process.env.CH_ID || "1");
  const label = process.env.LABEL || "steps-circuit@1.0.0";

  if (!cpAddr || !zkAddr) {
    throw new Error("Set CP_ADDR and ZK_ADDR env vars");
  }

  console.log("ChallengePay:", cpAddr);
  console.log("ZkProofVerifier:", zkAddr);
  console.log("chId:", chId.toString());

  const cp = await ethers.getContractAt("ChallengePay", cpAddr);
  const zk = await ethers.getContractAt("ZkProofVerifier", zkAddr);

  // Dump full challenge tuple
  const ch = await cp.getChallenge(chId);
  console.log("\n== getChallenge(chId) raw tuple ==");
  const asObj = {};
  Object.entries(ch).forEach(([k, v]) => {
    if (String(Number(k)) === k) return; // skip numeric indices
    asObj[k] = v;
  });
  console.log(asObj);

  // Heuristic proof-config detection
  let foundVerifierKey = null;
  let foundRequiredKey = null;

  for (const [k, v] of Object.entries(asObj)) {
    if (typeof v === "string" && v.startsWith("0x") && v.length === 42) {
      if (v.toLowerCase() === zkAddr.toLowerCase()) foundVerifierKey = k;
    }
  }
  for (const [k, v] of Object.entries(asObj)) {
    if (typeof v === "boolean") {
      const lk = k.toLowerCase();
      if (lk.includes("proof") || lk.includes("verify") || lk.includes("required")) {
        foundRequiredKey = k;
        break;
      }
    }
  }

  console.log("\n== Heuristic proof-config guess ==");
  console.log({
    verifierMatchesZkAddr: !!foundVerifierKey,
    verifierField: foundVerifierKey || "(not found among named fields)",
    requiredField: foundRequiredKey || "(not found among named fields)",
    requiredValue: foundRequiredKey ? asObj[foundRequiredKey] : undefined,
  });

  // Show zk model entry
  const modelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
  const m = await zk.models(modelHash);
  console.log("\n== zk.models(modelHash) ==");
  console.log({
    label,
    modelHash,
    verifier: m[0],
    active: m[2],
    enforce: m[3],
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
