// scripts/ops/composeAndSubmitProof.ts
// Build an Attestation, sign with M local keys, submit to ChallengePay.
//
// Env:
//   ADDR=<ChallengePay>
//   CH_ID=<number>
//   SUBJECT=<0xaddr>               (optional; default: signer.address)
//   RULE_KIND=<num>                (default 1)
//   MIN_DAILY=<num>                (default 10000)
//   PERIOD_START / PERIOD_START_TS (unix) (optional; default: challenge.startTs)
//   PERIOD_END   / PERIOD_END_TS   (unix) (optional; default: PERIOD_START + DURATION_SEC)
//   DURATION_SEC                    (default 604800 = 7d if PERIOD_END not set)
//   DATASET_STR=<string> or DATASET_HASH=0x.. (one required; STR is keccak256'd)
//   PASS=<true|false>              (default true)
//   FORCE_SIGN=1                   (override guard that prevents PASS before periodEnd)
//   VERIFIER=<0xaddr>              (required; MultiSigProofVerifier)
//   ATTESTER_PKS=<pk1,pk2,...>     (comma-separated hex keys)
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import { header, info, fail, context } from "../dev/utils";
import { Attestation, buildProof, signAttestation } from "../lib/attestation";
import { keccak256, toUtf8Bytes } from "ethers";

function n(v: any, d: number) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function b(v: any, d = true) {
  if (v === undefined) return d;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}
function pickTs(primary?: string, alt?: string, dflt?: number): number {
  const val = primary ?? alt;
  if (!val) return dflt ?? 0;
  if (!/^\d+$/.test(val)) throw new Error(`Timestamp must be unix seconds: ${val}`);
  return Number(val);
}

async function main() {
  header("Compose + Submit Proof (local multisig)");
  const { cp, addr, net, signer } = await context();

  const id = BigInt(process.env.CH_ID || "0");
  if (!id) throw new Error("CH_ID must be set");

  const subject = (process.env.SUBJECT || (await signer.getAddress())).toString();
  const ruleKind = n(process.env.RULE_KIND, 1);
  const minDaily = n(process.env.MIN_DAILY, 10000);
  const pass = b(process.env.PASS, true);
  const verifier = (process.env.VERIFIER || "").toString();
  if (!verifier) throw new Error("VERIFIER is required (MultiSigProofVerifier address)");

  let datasetHash = (process.env.DATASET_HASH || "").toString();
  const datasetStr = process.env.DATASET_STR || "";
  if (!datasetHash) {
    if (!datasetStr) throw new Error("Provide DATASET_STR or DATASET_HASH");
    datasetHash = keccak256(toUtf8Bytes(datasetStr));
  }

  const pks = (process.env.ATTESTER_PKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (pks.length === 0) throw new Error("Provide ATTESTER_PKS=pk1,pk2,...");

  const chainId = BigInt((await ethers.provider.getNetwork()).chainId);

  // Fetch challenge to default periodStart
  const ch = await cp.getChallenge(id);
  const defaultStart = Number(ch.startTs);

  // NEW: smarter period handling
  const periodStart = pickTs(process.env.PERIOD_START, process.env.PERIOD_START_TS, defaultStart);
  const duration = n(process.env.DURATION_SEC, 7 * 24 * 3600);
  const periodEnd = pickTs(process.env.PERIOD_END, process.env.PERIOD_END_TS, periodStart + duration);

  const latest = await ethers.provider.getBlock("latest");
  const now = Number(latest?.timestamp ?? Math.floor(Date.now() / 1000));

  // Guard: don't allow pass before periodEnd unless FORCE_SIGN
  if (pass && now < periodEnd && !b(process.env.FORCE_SIGN, false)) {
    console.log(
      `\n⚠️  Refusing to sign PASS before periodEnd (${periodEnd}). ` +
      `Either wait or set FORCE_SIGN=1 for dev override.\n`
    );
    return;
  }

  info("Network", net || network.name);
  info("Contract", addr);
  info("Challenge", id.toString());
  info("Subject", subject);
  info("Verifier", verifier);
  console.log("RuleKind:", ruleKind, "MinDaily:", minDaily);
  console.log("Period  :", periodStart, "→", periodEnd);
  console.log("DatasetHash:", datasetHash);
  console.log("Attesters:", pks.length);

  const att: Attestation = {
    challengeId: id,
    subject,
    periodStart,
    periodEnd,
    ruleKind,
    minDaily,
    datasetHash,
    pass,
    chainId,
    verifier,
  };

  // Sign with local wallets
  const sigs: string[] = [];
  for (const pk of pks) {
    const w = new ethers.Wallet(pk, ethers.provider);
    const sig = await signAttestation(att, w);
    sigs.push(sig);
  }

  const proof = buildProof(att, sigs);

  // Submit to ChallengePay
  const tx = await cp.submitProof(id, proof);
  console.log("Tx:", tx.hash);
  const rec = await tx.wait();
  console.log("Included in block:", rec.blockNumber);
  console.log("✅ Proof submitted.");
}

main().catch(fail);