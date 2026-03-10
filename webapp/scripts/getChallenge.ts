// scripts/getChallenge.ts
import { ABI, ADDR, publicClient } from "../lib/contracts";
import type { Address } from "viem";
import { formatUnits } from "viem";

const STATUS = ["Pending", "Approved", "Rejected", "Finalized"] as const;
const OUTCOME = ["None", "Success", "Fail"] as const;
const CURRENCY = ["NATIVE", "ERC20"] as const;

function fmtWei(x: bigint, dec = 18) {
  return Number(formatUnits(x, dec)).toString();
}
function fmtUnix(x: bigint | number) {
  const n = Number(x);
  if (!n) return "—";
  return `${n} (unix)`;
}
function fmtAddr(a?: string) {
  if (!a || a === "0x0000000000000000000000000000000000000000") return "0x0000…0000";
  return a;
}

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("Usage: tsx scripts/getChallenge.ts <id>");
  const id = BigInt(raw);

  const c: any = await publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "getChallenge",
    args: [id],
  });

  // Support both named and tuple positions
  const statusNum = Number(c.status ?? c[2] ?? 0);
  const outcomeNum = Number(c.outcome ?? c[3] ?? 0);
  const currencyNum = Number(c.currency ?? c[5] ?? 0);

  const stake = BigInt(c.stake ?? c[7] ?? 0n);
  const bond = BigInt(c.proposalBond ?? c[8] ?? 0n);
  const pool = BigInt(c.pool ?? c[21] ?? 0n);
  const partCount = Number(c.participantsCount ?? c[20] ?? 0);

  const peers: string[] = Array.isArray(c.peers ?? c[15]) ? (c.peers ?? c[15]) : [];
  const peerApprovals = Number(c.peerApprovals ?? c[17] ?? 0);
  const peerNeed = Number(c.peerApprovalsNeeded ?? c[16] ?? 0);
  const peerRej = Number(c.peerRejections ?? c[18] ?? 0);

  const charityBps = Number(c.charityBps ?? c[19] ?? 0);
  const charity = String(c.charity ?? c[20] ?? c[14] ?? "0x0000000000000000000000000000000000000000");

  const proofRequired = Boolean(c.proofRequired ?? c[22]);
  const verifier = String(c.verifier ?? c[23] ?? "0x0000000000000000000000000000000000000000");
  const proofOk = Boolean(c.proofOk ?? c[24]);
  const approvalDeadline = BigInt(c.approvalDeadline ?? c[10] ?? 0n);
  const startTs = BigInt(c.startTs ?? c[11] ?? 0n);
  const duration = BigInt(c.duration ?? c[12] ?? 0n);
  const maxParticipants = BigInt(c.maxParticipants ?? c[13] ?? 0n);
  const proofDeadline = BigInt(c.proofDeadlineTs ?? c[25] ?? 0n);
  const peerDeadline = BigInt(c.peerDeadlineTs ?? c[26] ?? 0n);

  console.log("────────────────────────────────────────────────────────");
  console.log("Challenge ID        :", id.toString());
  console.log("Status              :", `${statusNum} (${STATUS[statusNum] ?? "Unknown"})`);
  console.log("Outcome             :", `${outcomeNum} (${OUTCOME[outcomeNum] ?? "Unknown"})`);
  console.log("Kind                :", Number(c.kind ?? c[1] ?? 0));
  console.log("Challenger          :", fmtAddr(c.challenger ?? c[4]));
  console.log("Currency            :", `${currencyNum} (${CURRENCY[currencyNum] ?? "Unknown"})`);
  console.log("Token               :", fmtAddr(c.token ?? c[6]));
  console.log("Stake               :", fmtWei(stake));
  console.log("Proposal Bond       :", fmtWei(bond));
  console.log("Pool (committed)    :", fmtWei(pool));
  console.log("Participants        :", partCount);
  console.log("Max Participants    :", maxParticipants.toString());
  console.log("Approval Deadline   :", fmtUnix(approvalDeadline));
  console.log("Start               :", fmtUnix(startTs));
  console.log("Duration            :", `${duration.toString()} seconds`);
  console.log(
    "Voting Weights (yes/no/part):",
    `${String(c.yesWeight ?? c[14] ?? 0)} / ${String(c.noWeight ?? c[15] ?? 0)} / ${String(c.partWeight ?? c[16] ?? 0)}`
  );
  console.log("Peers               :", peers.length ? peers.join(", ") : "—");
  console.log("Peer Approvals      :", `${peerApprovals} / ${peerNeed} (rejections: ${peerRej})`);
  console.log("Charity             :", `${fmtAddr(charity)} (${charityBps} bps)`);
  console.log("Proof Required      :", proofRequired);
  console.log("Verifier            :", fmtAddr(verifier));
  console.log("Proof OK            :", proofOk);
  console.log("Proof Deadline      :", proofDeadline ? fmtUnix(proofDeadline) : "—");
  console.log("Peer Deadline       :", peerDeadline ? fmtUnix(peerDeadline) : "—");
  console.log("────────────────────────────────────────────────────────");

  const gated = proofRequired || peerNeed > 0;
  if (!gated) {
    const end = Number(startTs + duration);
    console.log(`Note: Ungated challenge. Cannot finalize Success before end time: ${end}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });