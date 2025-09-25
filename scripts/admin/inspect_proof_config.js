const { ethers } = require("hardhat");

async function main() {
  const cpAddr = process.env.CP_ADDR || "0x20E2F8c50816Ba7587DB4d7E36C4F19f1BcA6919"; // your ChallengePay
  const chId = BigInt(process.env.CH_ID || "1");

  const cp = await ethers.getContractAt("ChallengePay", cpAddr);

  // Print all callable function names for quick eyeballing
  const fnNames = cp.interface.fragments
    .filter(f => f.type === "function")
    .map(f => f.format())
  console.log("== ABI functions ==");
  for (const s of fnNames) console.log(" -", s);

  // Try common getter names in order
  const candidates = [
    "proofConfigs(uint256)",
    "proofConfig(uint256)",
    "getProofConfig(uint256)",
    "getProof(uint256)",
    "getProofCfg(uint256)",
  ];

  for (const sig of candidates) {
    try {
      if (!cp.interface.getFunction(sig)) continue;
      const res = await cp[sig.split("(")[0]](chId);
      let out = {};
      if (res && typeof res === "object") {
        // normalize tuple/struct or array
        const arr = Array.isArray(res) ? res : Object.values(res);
        // try typical shape: (verifier, minStake?, required?, enforce?)
        // or (required, verifier) depending on your contract
        // We'll try to map common field names if they exist
        if (res.required !== undefined || res.verifier !== undefined) {
          out.required = res.required ?? res[0] ?? undefined;
          out.verifier = res.verifier ?? res[1] ?? undefined;
          out.extra = res;
        } else {
          out = { tuple: arr };
        }
      } else {
        out = { value: res };
      }
      console.log(`\n✔ Read via ${sig} for chId=${chId}:`, out);
      return; // success, stop here
    } catch (e) {
      // ignore and try next
    }
  }

  console.log("\nNo known proof-config getter matched. Check the ABI list above for the correct function name.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
