// scripts/manual/create-challenge-standalone.mjs
// Node >=18, ESM. No Hardhat needed.

import { ethers } from "ethers";

// ---- ENV ----
// Required: RPC_URL, PRIVATE_KEY, CHALLENGEPAY_ADDR
const {
  RPC_URL,
  PRIVATE_KEY,
  CHALLENGEPAY_ADDR,
  STAKE = "0.4",                 // in LCAI
  BOND = "0.000000081454285089", // in LCAI
  DURATION = String(3 * 24 * 3600), // seconds
  START_PAD = "1800",            // seconds to add on top of minLeadTime
  AD_PAD = "600",                // approval window pad (must end before start)
  AUTO_APPROVAL_STRATEGY = process.env.NEXT_PUBLIC_AUTO_APPROVAL_STRATEGY || "", // optional
} = process.env;

function requireEnv(name, v) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

requireEnv("RPC_URL", RPC_URL);
requireEnv("PRIVATE_KEY", PRIVATE_KEY);
requireEnv("CHALLENGEPAY_ADDR", CHALLENGEPAY_ADDR);

const CP_ABI = [
  // reads
  "function minLeadTime() view returns (uint256)",
  "function maxLeadTime() view returns (uint256)",
  "function nextChallengeId() view returns (uint256)",
  // create (payable)
  `function createChallenge((
    uint8 kind,
    uint8 currency,
    address token,
    uint256 stakeAmount,
    uint256 proposalBond,
    uint256 approvalDeadline,
    uint256 startTs,
    uint256 duration,
    uint256 maxParticipants,
    address[] peers,
    uint8 peerApprovalsNeeded,
    uint16 charityBps,
    address charity,
    bool proofRequired,
    address verifier,
    uint256 proofDeadlineTs,
    uint256 peerDeadlineTs,
    bytes32 externalId,
    uint256 leadTime,
    bytes fastTrackData,
    address strategy,
    bytes strategyData
  ) p) payable returns (uint256)`
];

const ZERO = "0x0000000000000000000000000000000000000000";

function toWei(v) { return ethers.parseEther(String(v)); }
function nowSec() { return Math.floor(Date.now() / 1000); }

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const cp = new ethers.Contract(CHALLENGEPAY_ADDR, CP_ABI, wallet);

  const [minLeadTime, maxLeadTime] = await Promise.all([
    cp.minLeadTime(),
    cp.maxLeadTime(),
  ]);
  const leadTime = minLeadTime;                     // respect contract
  const startTs = BigInt(nowSec() + Number(leadTime) + Number(START_PAD)); // >= now + lead
  const approvalDeadline = BigInt(nowSec() + Number(AD_PAD));              // must be < startTs

  if (approvalDeadline >= startTs) {
    throw new Error(
      `approvalDeadline (${approvalDeadline}) must be < startTs (${startTs}). ` +
      `Increase START_PAD or reduce AD_PAD.`
    );
  }

  // Build params (Currency.NATIVE = 0)
  const params = {
    kind: 0,
    currency: 0,
    token: ZERO,
    stakeAmount: toWei(STAKE),
    proposalBond: toWei(BOND),
    approvalDeadline,
    startTs,
    duration: BigInt(Number(DURATION)),
    maxParticipants: 0,               // 0 = unlimited
    peers: [],
    peerApprovalsNeeded: 0,
    charityBps: 0,
    charity: ZERO,
    proofRequired: false,
    verifier: ZERO,
    proofDeadlineTs: 0n,
    peerDeadlineTs: 0n,
    externalId: ethers.ZeroHash,      // or set a bytes32 if you want
    leadTime,                         // REQUIRED by your contract
    fastTrackData: "0x",              // leave empty unless you have a FastTrackVerifier
    strategy: (AUTO_APPROVAL_STRATEGY && AUTO_APPROVAL_STRATEGY !== ZERO)
      ? AUTO_APPROVAL_STRATEGY
      : ZERO,
    strategyData: "0x",               // encode if your strategy expects data
  };

  const value = params.stakeAmount + params.proposalBond;

  console.log("➜ createChallenge(params):", {
    ...params,
    stakeAmount: params.stakeAmount.toString(),
    proposalBond: params.proposalBond.toString(),
    approvalDeadline: params.approvalDeadline.toString(),
    startTs: params.startTs.toString(),
    duration: params.duration.toString(),
    value: value.toString(),
  });

  const nextBefore = await cp.nextChallengeId();
  const tx = await cp.createChallenge(params, { value });
  console.log("tx sent:", tx.hash);
  const rec = await tx.wait();
  console.log("mined in block:", rec.blockNumber);

  const nextAfter = await cp.nextChallengeId();
  const createdId = nextAfter - 1n;

  console.log("✓ Created challenge id:", createdId.toString());
  console.log("   approvalDeadline:", approvalDeadline.toString(), new Date(Number(approvalDeadline) * 1000).toISOString());
  console.log("   startTs:",          startTs.toString(),          new Date(Number(startTs) * 1000).toISOString());
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});