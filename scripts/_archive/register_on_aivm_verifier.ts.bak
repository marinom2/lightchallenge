// scripts/register_on_aivm_verifier.ts
import "dotenv/config";
import { JsonRpcProvider, Wallet, Contract, isAddress } from "ethers";

/** ─────────────────────────────────────────────────────────────────────────────
 *  Minimal admin ABI for AivmProofVerifier
 *  ──────────────────────────────────────────────────────────────────────────── */
const VERIFIER_ABI = [
  "function owner() view returns (address)",
  "function isAivmSigner(address) view returns (bool)",
  "function setAivmSigner(address signer, bool allowed) external",
  "function setModelAllowed(bytes32 modelId, bool allowed) external",
  "function setEnforceModelAllowlist(bool enabled) external",
] as const;

/** ─────────────────────────────────────────────────────────────────────────────
 *  Env + type guards
 *  ──────────────────────────────────────────────────────────────────────────── */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v.trim();
}

function requireHexAddress(name: string, v: string): `0x${string}` {
  if (!isAddress(v)) {
    throw new Error(`Env ${name} is not a valid address: ${v}`);
  }
  return v as `0x${string}`;
}

function requirePrivKey(name: string, v: string): `0x${string}` {
  const ok = /^0x[0-9a-fA-F]{64}$/.test(v);
  if (!ok) throw new Error(`Env ${name} must be a 0x-prefixed 32-byte hex private key`);
  return v as `0x${string}`;
}

/** ─────────────────────────────────────────────────────────────────────────────
 *  Load & validate env
 *  ──────────────────────────────────────────────────────────────────────────── */
const RPC_URL = requireEnv("RPC_URL");
const OPERATOR_PK = requirePrivKey("ZK_PRIVATE_KEY", requireEnv("ZK_PRIVATE_KEY"));
const VERIFIER_ADDR = requireHexAddress(
  "NEXT_PUBLIC_AIVM_VERIFIER_ADDR",
  requireEnv("NEXT_PUBLIC_AIVM_VERIFIER_ADDR"),
);

// AIVM signer EOA: prefer explicit address, otherwise derive from private key if provided
let AIVM_SIGNER_EOA: `0x${string}` | undefined;
const explicitSigner = process.env.AIVM_SIGNER_EOA?.trim();
if (explicitSigner) {
  AIVM_SIGNER_EOA = requireHexAddress("AIVM_SIGNER_EOA", explicitSigner);
} else if (process.env.AIVM_SIGNER_KEY?.trim()) {
  const pk = requirePrivKey("AIVM_SIGNER_KEY", process.env.AIVM_SIGNER_KEY.trim());
  AIVM_SIGNER_EOA = new Wallet(pk).address as `0x${string}`;
}

/** ─────────────────────────────────────────────────────────────────────────────
 *  Your model IDs (bytes32 keccak of model strings)
 *  ──────────────────────────────────────────────────────────────────────────── */
const MODELS: ReadonlyArray<{ id: `0x${string}`; label: string }> = [
  { id: "0xd3a933d7c65286991ffe453223bf2a153111795364835762b04dc6703e84211e", label: "Strava distance (ZK) — optional here" },
  { id: "0x2e3f88a0496e6650c192355be471a62cae0bda1aece751eb2b30affd0f010c9e", label: "Apple Health steps (AIVM)" },
  { id: "0x7abfc322e4b015bd06ff99afe644c44868506d0ef39ae80a17b21813a389a1f2", label: "Garmin steps (AIVM)" },
  { id: "0x39abeb3664e21ae78cd0ae1b2393ac5e3d3fa3fa5a2f290474c323cce59d93c6", label: "Dota winrate (AIVM)" },
  { id: "0x6a68a575fa50ebbc7c0404ebe2078f7a79cfa95b4c2efd9c869b0744137456c3", label: "LoL winrate (AIVM)" },
  { id: "0x0de4617204f86e47e89b88696ce2d323fa053589dce9152a523741429a83ddb1", label: "Dota hero kills (AIVM)" },
  { id: "0xe8fe0f3dccfa30d73e362ae12070b18b4ce623d836a7bca392429212ecb14def", label: "Dota private 1v1 (AIVM)" },
  { id: "0xa36667f7fba0e008bfca236bcec118fef4f7177046cbc57f093b557b41ca95e6", label: "Dota private 5v5 (AIVM)" },
];

/** ─────────────────────────────────────────────────────────────────────────────
 *  Main
 *  ──────────────────────────────────────────────────────────────────────────── */
async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  const operator = new Wallet(OPERATOR_PK, provider);
  const verifier = new Contract(VERIFIER_ADDR, VERIFIER_ABI, operator);

  console.log("Operator:", operator.address);
  console.log("Verifier:", VERIFIER_ADDR);

  const owner: `0x${string}` = (await verifier.owner()) as `0x${string}`;
  console.log("Contract owner:", owner);

  if (owner.toLowerCase() !== operator.address.toLowerCase()) {
    throw new Error(
      `This signer is not the contract owner. Use the private key for ${owner} in ZK_PRIVATE_KEY.`,
    );
  }

  // 1) Approve AIVM signer (if provided)
  if (AIVM_SIGNER_EOA) {
    const already: boolean = await verifier.isAivmSigner(AIVM_SIGNER_EOA);
    if (already) {
      console.log("✓ AIVM signer already allowed:", AIVM_SIGNER_EOA);
    } else {
      const tx = await verifier.setAivmSigner(AIVM_SIGNER_EOA, true);
      console.log("→ setAivmSigner", AIVM_SIGNER_EOA, "true  tx:", tx.hash);
      await tx.wait();
      console.log("✓ signer added");
    }
  } else {
    console.warn("⚠️ No AIVM_SIGNER_EOA provided/derived. Skipping signer allow.");
  }

  // 2) Allowlist models
  for (const m of MODELS) {
    try {
      const tx = await verifier.setModelAllowed(m.id, true);
      console.log("→ setModelAllowed", m.label, m.id, "tx:", tx.hash);
      await tx.wait();
    } catch (e: any) {
      console.warn(`⚠️ setModelAllowed failed for ${m.label} (${m.id}): ${e?.reason || e?.message || e}`);
    }
  }

  // 3) Enforce allowlist
  try {
    const tx = await verifier.setEnforceModelAllowlist(true);
    console.log("→ setEnforceModelAllowlist true  tx:", tx.hash);
    await tx.wait();
  } catch (e: any) {
    console.warn(`⚠️ setEnforceModelAllowlist failed (maybe already true): ${e?.reason || e?.message || e}`);
  }

  console.log("✔ All done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});