// scripts/ops/submitProof.ts
//
// Submit proof bytes to ChallengePay.
//
// Modes:
//  A) Raw mode (exactly like your old script):
//     - PROOF=0x...   or  PROOF_FILE=./proof.bin
//
//  B) Attestation builder mode (for MultiSigProofVerifier):
//     - You provide the attestation fields + SIGNERS private keys (comma-separated).
//       The script will build the attestation, sign it with each provided key,
//       and ABI-encode proof = abi.encode(Attestation, bytes[] signatures).
//
// Required env:
//   CH_ID=<number>             Challenge id
//
// Raw mode (choose one):
//   PROOF=0x...                or
//   PROOF_FILE=./proof.bin
//
// Builder mode (when PROOF/PROOF_FILE not given):
//   VERIFIER=<address>         MultiSigProofVerifier address (or in deployments JSON)
//   SUBJECT=<address>          Participant wallet being attested
//   RULE=<int>                 e.g. 1 (MinDailySteps)
//   MIN_DAILY=<int>            e.g. 10000
//   PERIOD_START=<unix>        inclusive
//   PERIOD_END=<unix>          inclusive/exclusive (your convention)
//   DATASET_HASH=0x<32bytes>   keccak256 of normalized dataset
//   PASS=true|false
//   SIGNERS=pk1,pk2,...        EOA private keys of authorized attesters
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=1 PROOF=0x... \
//   npx hardhat run scripts/ops/submitProof.ts --network <net>
//
//   or (builder mode)
//   ADDR=<ChallengePay> CH_ID=1 VERIFIER=0x... SUBJECT=0x.. RULE=1 MIN_DAILY=10000 \
//   PERIOD_START=1731200000 PERIOD_END=1731804800 DATASET_HASH=0xaaaa... PASS=true \
//   SIGNERS=0x<pk1>,0x<pk2> \
//   npx hardhat run scripts/ops/submitProof.ts --network <net>

import hardhat from "hardhat";
const { ethers, network } = hardhat;
import * as fs from "fs";
import path from "path";
import { context, header, info, fail } from "../dev/utils";

// Attestation helper (only used in builder mode)
type Attestation = {
  challengeId: bigint;
  subject: string;
  periodStart: number;
  periodEnd: number;
  ruleKind: number;
  minDaily: number;
  datasetHash: string;
  pass: boolean;
  chainId: bigint;
  verifier: string;
};

function loadJSON(p: string) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

function readProofRaw(): string | null {
  const hex = process.env.PROOF;
  const file = process.env.PROOF_FILE;
  if (hex && hex.startsWith("0x")) return hex;
  if (file) {
    const buf = fs.readFileSync(file);
    return "0x" + buf.toString("hex");
  }
  return null;
}

// These mirror scripts/lib/attestation.ts (so this file is self-sufficient)
const coder = ethers.AbiCoder.defaultAbiCoder();
const TYPEHASH =
  "0x3b94011e0cfe69b0a03951dca1e445e2ea0292a290a59e7e1a04e1f2a8b615b3";

function attestationHash(a: Attestation): string {
  const enc = coder.encode(
    [
      "bytes32","uint256","address","uint64","uint64","uint8","uint32","bytes32","bool","uint256","address"
    ],
    [
      TYPEHASH,
      a.challengeId,
      a.subject,
      a.periodStart,
      a.periodEnd,
      a.ruleKind,
      a.minDaily,
      a.datasetHash,
      a.pass,
      a.chainId,
      a.verifier
    ]
  );
  return ethers.keccak256(enc);
}

function buildProof(att: Attestation, signatures: string[]): string {
  const attTuple =
    "tuple(uint256 challengeId,address subject,uint64 periodStart,uint64 periodEnd,uint8 ruleKind,uint32 minDaily,bytes32 datasetHash,bool pass,uint256 chainId,address verifier)";
  return coder.encode([attTuple, "bytes[]"], [att, signatures]);
}

async function buildAttestationProof(cpAddr: string, chId: bigint): Promise<string> {
  // Resolve verifier from env or deployments JSON
  const dep = loadJSON(path.join("deployments", `${network.name}.json`));
  const verifierAddr = process.env.VERIFIER || dep.multiSigVerifier;
  if (!verifierAddr) throw new Error("Builder mode: set VERIFIER or deployments.multiSigVerifier");

  const subject = process.env.SUBJECT;
  if (!subject) throw new Error("Builder mode: SUBJECT=<address> required");

  const ruleKind = Number(process.env.RULE || "1");
  const minDaily = Number(process.env.MIN_DAILY || "10000");
  const pStart = Number(process.env.PERIOD_START || "0");
  const pEnd = Number(process.env.PERIOD_END || "0");
  const datasetHash = process.env.DATASET_HASH || "0x" + "00".repeat(32);
  const pass = /^true$/i.test(process.env.PASS || "true");

  const signersList = (process.env.SIGNERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (signersList.length === 0) {
    throw new Error("Builder mode: provide SIGNERS=0x<pk1>,0x<pk2>,...");
  }

  const chainId = BigInt((await ethers.provider.getNetwork()).chainId.toString());
  const att: Attestation = {
    challengeId: chId,
    subject,
    periodStart: pStart,
    periodEnd: pEnd,
    ruleKind,
    minDaily,
    datasetHash,
    pass,
    chainId,
    verifier: verifierAddr,
  };

  const h = attestationHash(att);
  const sigs: string[] = [];
  for (const pk of signersList) {
    const wallet = new ethers.Wallet(pk);
    // EIP-191 over the 32-byte hash
    const sig = await wallet.signMessage(ethers.getBytes(h));
    sigs.push(sig);
  }
  return buildProof(att, sigs);
}

async function main() {
  header("Submit Proof");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);
  const me = await signer.getAddress();

  info("Network", net || network.name);
  info("Sender", me);
  info("Contract", addr);
  info("Challenge", id.toString());

  // Read current challenge to show verifier & requirement
  const ch = await cp.getChallenge(id);
  if (!ch.proofRequired) {
    console.log("ℹ️ Challenge does not require proof (submission still allowed but unused).");
  }
  if (ch.verifier === ethers.ZeroAddress) {
    console.log("ℹ️ Verifier not set on challenge; your submission may not flip proofOk.");
  }
  console.log("Challenge verifier:", ch.verifier);

  // Mode A: raw proof OR Mode B: build from attestation fields
  const maybeRaw = readProofRaw();
  const proof = maybeRaw ?? (await buildAttestationProof(addr, id));

  const tx = await cp.submitProof(id, proof);
  console.log("Tx:", tx.hash);
  const rec = await tx.wait();
  console.log("Included in block:", rec.blockNumber);

  const post = await cp.getChallenge(id);
  console.log("proofOk:", post.proofOk);
  console.log("\n✅ Proof submitted.");
}

main().catch(fail);