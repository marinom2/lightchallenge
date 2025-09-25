import "@nomicfoundation/hardhat-ethers";

// Shared helpers for all scripts (ethers v6 / hardhat).
import hardhat from "hardhat";
const { ethers, network } = hardhat;
import fs from "fs";
import path from "path";

export type Ctx = {
  net: string;
  addr: string;
  signer: any;
  signerIndex: number; // -1 / negative means external PK
  cp: any; // ChallengePay
};

const DEPLOYMENTS_DIR = "deployments";
const CONTRACT_NAME = "ChallengePay";

// Used for console logs only
export const NATIVE_SYMBOL = process.env.NATIVE_SYMBOL ?? "LCAI";

/* ────────────────────────────────── IO helpers ────────────────────────────────── */
export function header(title: string) {
  const bar = "=".repeat(80);
  console.log(`\n${bar}\n${title}\n${bar}\n`);
}

export function info(label: string, value: any) {
  console.log(`${label.padEnd(18)}: ${value}`);
}

export function warn(msg: string) {
  console.warn(`\n⚠️  ${msg}\n`);
}

/** Print concise, friendly errors and exit(1). */
export function fail(e: unknown) {
  const m = `${e instanceof Error ? e.message : String(e)}`;
  if (/execution reverted/i.test(m)) {
    console.error(`\n❌ Reverted: ${m}\n`);
  } else if (/insufficient funds/i.test(m)) {
    console.error(`\n❌ Insufficient funds to send the transaction.\n`);
  } else if (/HH3\d{2}/i.test(m)) {
    console.error(`\n❌ Hardhat: ${m}\n`);
  } else if (/invalid (address|bytes32|array)/i.test(m)) {
    console.error(`\n❌ Bad parameter: ${m}\n`);
  } else {
    console.error(`\n❌ ${m}\n`);
  }
  process.exit(1);
}

/* Resolve address from deployments/<net>.json */
export function readDeploymentAddress(net: string): string {
  const p = path.join(DEPLOYMENTS_DIR, `${net}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p}. Run the deploy script first.`);
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));

  const candidates = [
    j[CONTRACT_NAME],
    j.ChallengePay,
    j.address,
    j.contract,
    j.cp,
  ].filter((x) => typeof x === "string");

  const addr = candidates.find((x) => /^0x[0-9a-fA-F]{40}$/.test(x || ""));
  if (!addr) {
    throw new Error(
      `Contract address not found in ${p}. Expected one of keys: ${CONTRACT_NAME}, ChallengePay, address, contract, cp.`
    );
  }
  return addr;
}

/* ─────────────────────────── Signers (env & index) ─────────────────────────── */
async function signerFromPrivateKey(pk: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error(`PK is not a 0x-prefixed 32-byte private key`);
  }
  const provider = ethers.provider;
  const wallet = new (ethers as any).Wallet(pk, provider);
  return wallet;
}

export async function getSignerFromEnv(): Promise<[any, number]> {
  if (process.env.PK) {
    const s = await signerFromPrivateKey(process.env.PK);
    return [s, -1];
  }
  const idxStr = process.env.USE_PK_N ?? "";
  if (/^\d+$/.test(idxStr)) {
    const pkN = process.env[`PK${idxStr}`];
    if (pkN) {
      const s = await signerFromPrivateKey(pkN);
      return [s, -Number(idxStr)];
    }
  }
  const idxEnv = process.env.SIGNER_INDEX ?? process.env.INDEX ?? "0";
  const idx = parseInt(idxEnv, 10);
  const all = await ethers.getSigners();
  if (!Number.isFinite(idx) || idx < 0 || idx >= all.length) {
    throw new Error(`SIGNER_INDEX=${idxEnv} out of range (have ${all.length} signers).`);
  }
  return [all[idx], idx];
}

export async function connectContract(addr: string, signer: any): Promise<any> {
  return await ethers.getContractAt(CONTRACT_NAME, addr, signer);
}

export async function context(): Promise<Ctx> {
  const net = network.name;
  const [signer, signerIndex] = await getSignerFromEnv();
  const envAddr = process.env.CONTRACT_ADDR || process.env.CONTRACT;
  const addr = envAddr && /^0x[0-9a-fA-F]{40}$/.test(envAddr)
    ? envAddr
    : readDeploymentAddress(net);
  const cp = await connectContract(addr, signer);
  return { net, addr, signer, signerIndex, cp };
}

/* ───────────────────────── Formatting & parsing ───────────────────────── */
export const toWei = (n: string | number) => ethers.parseEther(String(n));

export function toWeiStrict(n: string | number): bigint {
  const s = String(n);
  if (!/^-?\d+(\.\d{1,18})?$/.test(s)) {
    throw new Error(`Invalid decimal amount: "${s}". Expected up to 18 decimals, no scientific notation.`);
  }
  if (s.startsWith("-")) throw new Error(`Negative amounts not allowed: "${s}"`);
  return ethers.parseEther(s);
}

export const fmtWei = (v: bigint) => ethers.formatEther(v);
export const fmtTs = (s: bigint | number | string) => {
  const n = BigInt(s);
  return `${n} (${new Date(Number(n) * 1000).toISOString()})`;
};
export const fmtBps = (bps: bigint | number) => `${bps.toString()} bps`;
export const fmtPct = (num: bigint | number, den: bigint | number) =>
  (Number(den) > 0 ? `${((Number(num) / Number(den)) * 100).toFixed(2)}%` : "—");

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "0x0");

/* ─────────────────────────── Domain helpers ─────────────────────────── */
export async function latestId(cp: any): Promise<bigint | null> {
  const next: bigint = (await cp.nextChallengeIdView?.()) ?? (await cp.nextChallengeId());
  if (next === 0n) return null;
  return next - 1n;
}

export async function readChallenge(cp: any, id: bigint): Promise<any> {
  if (cp.getChallenge) return await cp.getChallenge(id);
  return await cp.challenges(id);
}

export function printChallenge(ch: any) {
  const cur = Number(ch.currency ?? ch[3] ?? 0);

  const stakeRaw =
    (ch.stakeAmount ?? ch.stake ?? ch[4] ?? 0n) as bigint | number | string;
  const bondRaw =
    (ch.proposalBond ?? ch.bond ?? ch[5] ?? 0n) as bigint | number | string;

  const approvalDeadlineRaw = (ch.approvalDeadline ?? ch[7] ?? 0n) as any;
  const startTsRaw = (ch.startTs ?? ch[8] ?? 0n) as any;

  const poolSuccessRaw = (ch.poolSuccess ?? ch[12] ?? 0n) as any;
  const poolFailRaw = (ch.poolFail ?? ch[13] ?? 0n) as any;

  const yes = BigInt(ch.yesWeight ?? ch[20] ?? 0);
  const no = BigInt(ch.noWeight ?? ch[21] ?? 0);
  const part = BigInt(ch.partWeight ?? ch[22] ?? 0);

  console.log(`  status          : ${ch.status ?? ch[0]} (0=pending,1=approved,2=rejected,3=finalized)`);
  console.log(`  outcome         : ${ch.outcome ?? ch[1]} (0=None,1=Success,2=Fail)`);
  console.log(`  challenger      : ${ch.challenger ?? ch[2]}`);
  console.log(`  currency        : ${cur === 0 ? "native" : "erc20"}`);
  console.log(`  token           : ${ch.token ?? ch[6]}`);
  console.log(`  stake           : ${fmtWei(BigInt(stakeRaw))} ${NATIVE_SYMBOL}`);
  console.log(`  bond            : ${fmtWei(BigInt(bondRaw))} ${NATIVE_SYMBOL}`);
  console.log(`  approvalDeadline: ${fmtTs(approvalDeadlineRaw)}`);
  console.log(`  startTs         : ${fmtTs(startTsRaw)}`);
  console.log(`  validator wgt   : yes=${fmtWei(yes)} / no=${fmtWei(no)} / part=${fmtWei(part)} ${NATIVE_SYMBOL}`);

  const peers = ch.peers ?? ch[9] ?? [];
  const m = ch.peerApprovalsNeeded ?? ch[10] ?? 0;
  console.log(`  peers M/N       : ${m}/${peers.length}`);
  console.log(`  peer votes      : approvals=${ch.peerApprovals ?? ch[11]} rejections=${ch.peerRejections ?? ch[19]}`);

  console.log(`  participants    : ${ch.participantsCount ?? ch[16] ?? 0}`);
  console.log(`  charityBps      : ${ch.charityBps ?? ch[17] ?? 0}  charity: ${ch.charity ?? ch[18] ?? ethers.ZeroAddress}`);

  console.log(`  pools S/F       : ${fmtWei(BigInt(poolSuccessRaw))} / ${fmtWei(BigInt(poolFailRaw))} ${NATIVE_SYMBOL}`);

  console.log(`  proof           : required=${Boolean(ch.proofRequired ?? ch[14])} verifier=${shortAddr(ch.verifier ?? ch[15])} ok=${Boolean(ch.proofOk ?? ch[23])}`);
}

export function requireHexAddress(name: string, val: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(val)) {
    throw new Error(`Invalid ${name}: "${val}". Expected a 0x-prefixed 20-byte address.`);
  }
}

export function parseAddressCSV(envName: string, fallback: string[] = []): string[] {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return fallback;
  list.forEach((a) => requireHexAddress(envName, a));
  return list;
}

export async function confirmDangerousAction(hint: string) {
  if (process.env.CONFIRM === "YES") return;
  throw new Error(`Refusing to ${hint} without CONFIRM=YES. Re-run with: CONFIRM=YES <command>`);
}

/* ───────────────────────────── Time helpers ───────────────────────────── */
export function computeSafeStartTs(opts: {
  nowChain: number;
  leadSec: number;
  startTsInput?: number | null;
  startPadSec?: number;
}): { startTs: number; adjusted: boolean } {
  const { nowChain, leadSec, startTsInput, startPadSec = 3600 } = opts;
  const desired = startTsInput ?? (nowChain + startPadSec);
  const minStartStrict = nowChain + leadSec + 1; // +1 sec cushion
  let startTs = desired;
  let adjusted = false;

  if (startTs <= minStartStrict) {
    startTs = minStartStrict;
    adjusted = true;
  }
  if (startTs <= nowChain) {
    startTs = nowChain + 60;
    adjusted = true;
  }
  return { startTs, adjusted };
}