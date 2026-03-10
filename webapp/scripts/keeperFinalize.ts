// scripts/keeperFinalize.ts
import { ABI, ADDR, publicClient as sharedPublic } from "../lib/contracts";
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** ─────────── Env / setup ─────────── */
const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const PRIV = (process.env.KEEPER_PRIVKEY || "").trim();
const SCAN = Number(process.env.KEEPER_SCAN || 200); // how many latest ids to scan

if (!PRIV || !/^0x[0-9a-fA-F]{64}$/.test(PRIV)) {
  console.error("[keeper] Missing/invalid KEEPER_PRIVKEY (expected 0x… 64-hex).");
  process.exit(1);
}

const chain = {
  id: 504,
  name: "lightchain",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const;

const account = privateKeyToAccount(PRIV as `0x${string}`);
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

// Use the app’s public client (server config resolves to real RPC)
const publicClient = sharedPublic;

const challengePay = ADDR.ChallengePay as Address;

const STATUS = ["Pending", "Approved", "Rejected", "Finalized"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => BigInt(Math.floor(Date.now() / 1000));
const log = (...a: any[]) => console.log(`[keeper ${new Date().toISOString()}]`, ...a);

/** Read challenge view once */
async function readChallenge(id: bigint) {
  return (await publicClient.readContract({
    address: challengePay,
    abi: ABI.ChallengePay,
    functionName: "getChallenge",
    args: [id],
  })) as any;
}

/** Decide if a challenge is eligible to be finalized right now */
async function isFinalizeEligible(id: bigint) {
  const c: any = await readChallenge(id);
  const statusNum = Number(c.status ?? c[2]); // 0..3
  const status = STATUS[statusNum] ?? `Unknown(${statusNum})`;

  if (status === "Finalized") return { eligible: false, reason: "already Finalized" };

  const n = nowSec();

  // Pending → after approvalDeadline we can finalize → contract will mark Rejected + stage refunds
  if (status === "Pending") {
    const approvalDeadline = BigInt(c.approvalDeadline ?? c[9]);
    if (n > approvalDeadline) return { eligible: true, reason: "Pending past approvalDeadline" };
    return { eligible: false, reason: "Pending before approvalDeadline" };
  }

  // Rejected → always ok to finalize (snapshot/reject path)
  if (status === "Rejected") return { eligible: true, reason: "Rejected (ok to finalize)" };

  // Approved path
  const startTs = BigInt(c.startTs ?? c[10]);
  const duration = BigInt(c.duration ?? c[11]);
  const endTime = startTs + duration;

  const proofRequired = Boolean(c.proofRequired ?? c[23]);
  const proofOk = Boolean(c.proofOk ?? c[25]);
  const proofDeadlineTs = BigInt(c.proofDeadlineTs ?? c[28] ?? 0n);

  const peerApprovalsNeeded = BigInt(c.peerApprovalsNeeded ?? c[17] ?? 0n);
  const peerApprovals = BigInt(c.peerApprovals ?? c[18] ?? 0n);
  const peerDeadlineTs = BigInt(c.peerDeadlineTs ?? c[29] ?? 0n);

  // If any gating deadline elapsed unmet → eligible (will Fail)
  if (proofRequired && proofDeadlineTs !== 0n && n > proofDeadlineTs && !proofOk) {
    return { eligible: true, reason: "Approved but proof deadline passed (Fail)" };
  }
  if (peerApprovalsNeeded > 0n && peerDeadlineTs !== 0n && n > peerDeadlineTs && peerApprovals < peerApprovalsNeeded) {
    return { eligible: true, reason: "Approved but peer deadline passed (Fail)" };
  }

  // Ungated must wait until end
  const gated = proofRequired || peerApprovalsNeeded > 0n;
  if (!gated && n < endTime) return { eligible: false, reason: "Approved ungated before endTime" };

  // Gated + satisfied → can finalize immediately (contract allows success before end for gated)
  if (gated) {
    const peersOk = peerApprovalsNeeded === 0n || peerApprovals >= peerApprovalsNeeded;
    const proofGateOk = !proofRequired || proofOk;
    if (peersOk && proofGateOk) return { eligible: true, reason: "Approved gated and gates met" };
    return { eligible: false, reason: "Approved gated but gates not met" };
  }

  // Ungated & past end
  return { eligible: true, reason: "Approved ungated and past endTime" };
}

/** Send finalize() and wait for receipt, then show new status */
async function finalizeOne(id: bigint) {
  try {
    const hash = await wallet.writeContract({
      address: challengePay,
      abi: ABI.ChallengePay,
      functionName: "finalize",
      args: [id],
    });
    log(`finalize(${id}) tx: ${hash}`);

    const r = await publicClient.waitForTransactionReceipt({ hash });
    log(`receipt(${id}) status: ${r.status}`);

    const c: any = await readChallenge(id);
    log(`challenge ${id} now status: ${Number(c.status)} (0=Pending,1=Approved,2=Rejected,3=Finalized)`);
  } catch (e: any) {
    log(`finalize(${id}) skipped/error: ${e?.shortMessage || e?.message || String(e)}`);
  }
}

async function getLatestId(): Promise<bigint> {
  const next = (await publicClient.readContract({
    address: challengePay,
    abi: ABI.ChallengePay,
    functionName: "nextChallengeId",
  })) as unknown as bigint;
  return next > 0n ? next - 1n : 0n;
}

async function main() {
  const latest = await getLatestId();
  if (latest <= 0n) {
    log("no challenges yet");
    return;
  }

  const span = isFinite(SCAN) && SCAN > 0 ? BigInt(SCAN) : 200n;
  const start = latest > span ? latest - span + 1n : 1n;

  log(`scanning ids ${start}..${latest}`);
  for (let id = start; id <= latest; id++) {
    const { eligible, reason } = await isFinalizeEligible(id);
    if (!eligible) continue;

    log(`eligible ${id}: ${reason}`);
    await finalizeOne(id);

    // small delay to avoid RPC throttling/nonce races
    await sleep(750);
  }
}

main().catch((e) => {
  console.error("[keeper fatal]", e?.shortMessage || e?.message || e);
  process.exit(1);
});