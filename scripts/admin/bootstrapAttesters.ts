// scripts/admin/bootstrapAttesters.ts
import "@nomicfoundation/hardhat-ethers";
import hre from "hardhat";
const { ethers, network } = hre;

import fs from "fs";
import path from "path";
import { NonceManager, getAddress, parseEther, formatEther, Wallet } from "ethers";
import { MultiSigProofVerifier__factory } from "../../typechain-types";

type AttesterCfg = { addr?: string; pk?: string };

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function header(s: string) {
  console.log("\n" + "═".repeat(80));
  console.log(s);
  console.log("═".repeat(80));
}

function loadDeployments(net: string) {
  const p = path.join("deployments", `${net}.json`);
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readAttestersFromEnv(): AttesterCfg[] {
  // Primary form: ATTESTER_0_ADDR/PK, ATTESTER_1_ADDR/PK, ...
  // Optional convenience: ATTESTER_PKS (comma separated) – addresses derived from PKs
  const fromPairs: AttesterCfg[] = [];
  for (let i = 0; i < 10; i++) {
    const addr = process.env[`ATTESTER_${i}_ADDR`];
    const pk = process.env[`ATTESTER_${i}_PK`];
    if (!addr && !pk) break;
    fromPairs.push({ addr: addr || undefined, pk: pk || undefined });
  }

  const pksEnv = (process.env.ATTESTER_PKS || "").split(",").map(s => s.trim()).filter(Boolean);
  const fromList: AttesterCfg[] = pksEnv.map(pk => ({ pk }));

  return [...fromPairs, ...fromList];
}

async function ensureAddresses(
  cfgs: AttesterCfg[],
  provider: any
): Promise<{ addr: string; pk?: string }[]> {
  const out: { addr: string; pk?: string }[] = [];
  for (const c of cfgs) {
    if (c.pk) {
      const wallet = new Wallet(c.pk, provider);
      out.push({ addr: getAddress(wallet.address), pk: c.pk });
    } else if (c.addr) {
      out.push({ addr: getAddress(c.addr) });
    }
  }
  // unique by address
  const seen = new Set<string>();
  return out.filter(a => {
    if (seen.has(a.addr)) return false;
    seen.add(a.addr);
    return true;
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────────
async function main() {
  header("Bootstrap MultiSig Attesters (fund + whitelist + threshold)");

  // Network + signer
  const [adminSignerRaw] = await ethers.getSigners();
  const admin = new NonceManager(adminSignerRaw);
  const adminAddr = await admin.getAddress();

  const dep = loadDeployments(network.name);
  const verifierAddr: string | undefined =
    (process.env.VERIFIER && process.env.VERIFIER !== "null" ? process.env.VERIFIER : undefined) ||
    dep?.multiSigVerifier;

  if (!verifierAddr) {
    throw new Error("Missing VERIFIER env and no deployments/<net>.json.multiSigVerifier found.");
  }

  // Read attesters
  const attestersCfg = readAttestersFromEnv();
  if (attestersCfg.length === 0) {
    throw new Error("No attesters in env. Provide ATTESTER_0_ADDR/PK, ATTESTER_1_ADDR/PK or ATTESTER_PKS.");
  }

  const attesters = await ensureAddresses(attestersCfg, ethers.provider);
  if (attesters.length === 0) {
    throw new Error("No usable attester addresses resolved from env.");
  }

  const FUND_AMT = parseEther(process.env.ATTESTER_FUND_AMT || "0.1");
  const SKIP_MIN = process.env.ATTESTER_MIN_BAL ? parseEther(process.env.ATTESTER_MIN_BAL) : null;
  const THRESH = Number(process.env.MSIG_THRESHOLD || "2");

  console.log("Network       :", network.name);
  console.log("Admin (funder):", adminAddr);
  console.log("Verifier      :", getAddress(verifierAddr));
  console.log("Attesters     :", attesters.map(a => a.addr).join(", "));
  console.log("Fund amount   :", formatEther(FUND_AMT));
  if (SKIP_MIN) console.log("Skip if bal ≥ :", formatEther(SKIP_MIN));
  console.log("Threshold (m) :", THRESH);

  // 1) FUND attesters (if needed)
  header("1) Funding attesters (if below min)");
  for (const a of attesters) {
    const bal = await ethers.provider.getBalance(a.addr);
    if (SKIP_MIN && bal >= SKIP_MIN) {
      console.log(`→ ${a.addr}  [skip: balance=${formatEther(bal)} ≥ ${formatEther(SKIP_MIN)}]`);
      continue;
    }
    const tx = await admin.sendTransaction({ to: a.addr, value: FUND_AMT });
    const rec = await tx.wait();
    console.log(`→ ${a.addr}  +${formatEther(FUND_AMT)} (tx ${tx.hash}, block ${rec.blockNumber})`);
  }

  // 2) WHITELIST attesters on verifier
  header("2) Whitelisting attesters on MultiSigProofVerifier");
  const verifier = MultiSigProofVerifier__factory.connect(getAddress(verifierAddr), admin);
  for (const a of attesters) {
    const tx = await verifier.setAttester(a.addr, true);
    await tx.wait();
    console.log(`✓ setAttester(${a.addr}, true)`);
  }

  // 3) SET THRESHOLD
  header("3) Set threshold");
  const txThr = await verifier.setThreshold(THRESH);
  await txThr.wait();
  console.log(`✓ setThreshold(${THRESH})`);

  console.log("\n✅ Bootstrap complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});