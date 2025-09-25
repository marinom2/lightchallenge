import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers } = hardhat;
import {
  header, info, fail, context,
  toWei, fmtTs, requireHexAddress, NATIVE_SYMBOL,
  computeSafeStartTs,
} from "../dev/utils";

function parseWhen(v?: string): number | null {
  if (!v) return null;
  const s = v.trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

function num(v: any, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

async function main() {
  header("Create Challenge");
  const { net, addr, signer, signerIndex, cp } = await context();

  const currency = 0;
  const token = ethers.ZeroAddress;

  const stake = toWei(process.env.STAKE ?? "0.0001");
  const bond  = toWei(process.env.BOND  ?? "0.00001");

  const peers = (process.env.PEERS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  peers.forEach((p) => requireHexAddress("peer", p));
  const peerApprovalsNeeded = num(process.env.PEER_M, 0);
  if (peerApprovalsNeeded > peers.length) {
    throw new Error(`PEER_M (${peerApprovalsNeeded}) > peers (${peers.length})`);
  }

  const maxParticipants = num(process.env.MAX_PARTICIPANTS, 100);
  if (maxParticipants < 0) throw new Error("MAX_PARTICIPANTS must be >= 0");

  const charityBps = num(process.env.CHARITY_BPS, 0);
  const charity = process.env.CHARITY ?? ethers.ZeroAddress;
  if (charity !== ethers.ZeroAddress) requireHexAddress("charity", charity);

  const proofRequired = (process.env.PROOF_REQUIRED ?? "0") === "1";
  const verifier = process.env.VERIFIER ?? ethers.ZeroAddress;
  if (proofRequired) {
    if (verifier === ethers.ZeroAddress) throw new Error("PROOF_REQUIRED=1 but VERIFIER not provided");
    requireHexAddress("verifier", verifier);
  } else if (verifier !== ethers.ZeroAddress) {
    console.warn("⚠️  VERIFIER is set but PROOF_REQUIRED=0 — verifier will be ignored.");
  }

  const latest = await ethers.provider.getBlock("latest");
  if (!latest) throw new Error("Cannot fetch latest block");
  const nowChain = Number(latest.timestamp);

  const leadBn: bigint = await cp.approvalLeadTime();
  const lead = Number(leadBn);

  // NEW: strict overrides (unix seconds) if provided
  const startOverride = parseWhen(process.env.START_TS ?? undefined);
  const adOverride    = parseWhen(process.env.APPROVAL_DEADLINE_TS ?? undefined);

  let startTs: number;
  let startAdjusted = false;

  if (startOverride != null) {
    startTs = startOverride;
    // must honor lead time
    if (startTs < nowChain + lead) {
      throw new Error(
        `START_TS (${startTs}) is earlier than now+lead (${nowChain + lead}). ` +
        `Either increase START_TS or lower approval lead time on-chain.`
      );
    }
  } else {
    // Your original adaptive logic
    const startPad = num(process.env.START_PAD, 3600);
    const res = computeSafeStartTs({
      nowChain,
      leadSec: lead,
      startTsInput: null,
      startPadSec: startPad,
    });
    startTs = res.startTs;
    startAdjusted = res.adjusted;
  }

  // approvalDeadline selection:
  let approvalDeadline: number;
  let deadlineAdjusted = false;

  if (adOverride != null) {
    approvalDeadline = adOverride;
  } else {
    const AD_PAD = num(process.env.AD_PAD, 600);
    approvalDeadline = nowChain + AD_PAD;
    deadlineAdjusted = false;
    if (approvalDeadline >= startTs) {
      approvalDeadline = Math.max(nowChain + 60, startTs - 60);
      deadlineAdjusted = true;
    }
    if (approvalDeadline <= nowChain) {
      approvalDeadline = nowChain + 60;
      deadlineAdjusted = true;
    }
  }

  // Validate relation if both were overridden
  if (adOverride != null && startOverride != null && approvalDeadline >= startTs) {
    throw new Error(
      `APPROVAL_DEADLINE_TS (${approvalDeadline}) must be < START_TS (${startTs}).`
    );
  }

  info("Network", net);
  info("Sender ", `${signer.address} (index ${signerIndex})`);
  info("Contract", addr);
  info("Timing ",
    JSON.stringify(
      {
        nowChain: String(nowChain),
        approvalLeadTimeSec: String(lead),
        startTs: `${startTs} (${new Date(startTs * 1000).toISOString()})`,
        startAdjusted,
        approvalDeadline: String(approvalDeadline),
        approvalDeadlineISO: new Date(approvalDeadline * 1000).toISOString(),
        deadlineAdjusted
      },
      null, 2
    )
  );

  const params = {
    kind: 0,
    currency,
    token,
    stakeAmount: stake,
    proposalBond: bond,
    approvalDeadline: BigInt(approvalDeadline),
    startTs: BigInt(startTs),
    maxParticipants,
    peers,
    peerApprovalsNeeded,
    charityBps,
    charity,
    proofRequired,
    verifier,
  };

  console.log("createChallenge() params:", {
    ...params,
    currency: NATIVE_SYMBOL,
    stakeAmount: stake.toString(),
  });

  const overrides: Record<string, bigint> = { value: stake + bond };

  const tx = await cp.createChallenge(params, overrides);
  const rec = await tx.wait();

  const next: bigint = (await cp.nextChallengeIdView?.()) ?? (await cp.nextChallengeId());
  const createdId = next - 1n;

  info("Submitted tx", tx.hash);
  info("Mined block", rec.blockNumber);
  console.log(
    `Created challenge #${createdId.toString()} (approvalDeadline=${fmtTs(BigInt(approvalDeadline))}, startTs=${fmtTs(BigInt(startTs))})`
  );
}

main().catch(fail);