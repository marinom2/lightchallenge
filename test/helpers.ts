// test/helpers.ts
import { ethers } from "hardhat";

/** Bigint helpers */
export const toWei = (v: string) => ethers.parseEther(v);
export const fmt = (v: bigint | number) =>
  ethers.formatUnits(typeof v === "number" ? BigInt(v) : v, 18);

/** Deploys ChallengePay with dao = deployer by default. */
export async function deployChallengePay() {
  const [deployer] = await ethers.getSigners();
  const F = await ethers.getContractFactory("ChallengePay");
  const cp = await F.deploy(deployer.address);
  await cp.waitForDeployment();
  return { cp, deployer };
}

/** Optionally deploy a mock proof verifier (matches MockProofVerifier.sol). */
export async function deployMockVerifier() {
  const F = await ethers.getContractFactory("MockProofVerifier");
  const mock = await F.deploy();
  await mock.waitForDeployment();
  return mock;
}

export async function fastForward(seconds: number) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}

export async function latestTimestamp(): Promise<number> {
  const b = await ethers.provider.getBlock("latest");
  if (!b) throw new Error("no latest block");
  return Number(b.timestamp);
}

/** Stake as validator using the current on-chain minValidatorStake (optionally bump by %). */
export async function stakeAs(signer: any, cp: any, bumpPct = 0n) {
  const min = (await cp.minValidatorStake()) as bigint;
  const bump = (min * bumpPct) / 100n;
  const amt = (min + bump) || 1n;
  await cp.connect(signer).stakeValidator({ value: amt });
}

/** Make validator params stricter for tests so one vote never reaches quorum+threshold by default. */
export async function configureValidatorParams(
  cp: any,
  opts?: Partial<{
    minStake: bigint;
    thresholdBps: number;
    quorumBps: number;
    cooldownSec: number;
  }>
) {
  const minStake = opts?.minStake ?? (await cp.minValidatorStake());
  const thresholdBps = opts?.thresholdBps ?? 6000; // 60%
  const quorumBps = opts?.quorumBps ?? 6000; // 60%

  // Avoid mixing ?? and || precedence issues:
  const cooldownFromChain = await cp
    .unstakeCooldownSec?.()
    .catch(() => undefined as unknown as bigint);
  const cooldownSec =
    opts?.cooldownSec ??
    Number(
      cooldownFromChain !== undefined && cooldownFromChain !== null
        ? cooldownFromChain
        : 3n * 24n * 3600n
    );

  await (await cp.setValidatorParams(minStake, thresholdBps, quorumBps, cooldownSec)).wait();
}

/** Set losers fee + splits (dao/creator/validators) and loser cashback. Follows the contract's split invariant. */
export async function setFeeConfig(cp: any, f: {
  losersFeeBps: number;
  daoBps: number;
  creatorBps: number;
  validatorsBps: number;
  rejectFeeBps?: number;
  rejectDaoBps?: number;
  rejectValidatorsBps?: number;
  loserCashbackBps?: number;
}) {
  // Enforce the invariant locally to catch mistakes early in tests:
  if (f.daoBps + f.creatorBps + f.validatorsBps !== f.losersFeeBps) {
    throw new Error("loser fee split mismatch");
  }
  const cfg = {
    losersFeeBps: f.losersFeeBps,
    daoBps: f.daoBps,
    creatorBps: f.creatorBps,
    validatorsBps: f.validatorsBps,
    rejectFeeBps: f.rejectFeeBps ?? 200,
    rejectDaoBps: f.rejectDaoBps ?? 200,
    rejectValidatorsBps: f.rejectValidatorsBps ?? 0,
    loserCashbackBps: f.loserCashbackBps ?? 100,
  };
  if (cfg.rejectDaoBps + cfg.rejectValidatorsBps !== cfg.rejectFeeBps) {
    throw new Error("reject fee split mismatch");
  }
  await (await cp.setFeeConfig(cfg)).wait();
}

/** Shorten approval lead time for tests (default 60s). */
export async function setShortLead(cp: any, leadSec = 60) {
  const current = Number(await cp.approvalLeadTime());
  if (current !== leadSec) {
    await (await cp.setApprovalLeadTime(leadSec)).wait();
  }
}

/**
 * Creates a challenge with:
 *  - lead time = 60s (short for tests)
 *  - approvalDeadline = now + 900s
 *  - startTs = now + lead + 1200s
 * (so: deadline < start, and start >= now + lead)
 * Pass overrides to tweak peers/proof/charity etc.
 */
export async function createBasicChallenge(cp: any, overrides?: Partial<any>) {
  // Lead short for tests
  await setShortLead(cp, 60);

  const now = await latestTimestamp();
  const lead = Number(await cp.approvalLeadTime());

  const approvalDeadline = BigInt(now + 900);
  const startTs = BigInt(now + lead + 1200);

  const params = {
    kind: 0,
    currency: 0,
    token: ethers.ZeroAddress,
    stakeAmount: toWei("0.0001"),
    proposalBond: toWei("0.000000000000000001"), // 1 wei
    approvalDeadline,
    startTs,
    maxParticipants: 10,
    peers: [] as string[],
    peerApprovalsNeeded: 0,
    charityBps: 0,
    charity: ethers.ZeroAddress,
    proofRequired: false,
    verifier: ethers.ZeroAddress,
    ...overrides,
  };

  const value = (params.stakeAmount as bigint) + (params.proposalBond as bigint);
  const tx = await cp.createChallenge(params, { value });
  await tx.wait();

  const next = (await cp.nextChallengeIdView?.()) ?? (await cp.nextChallengeId());
  return Number(next - 1n);
}

/** Convenience: get current challenge id to create next / fetch last. */
export async function nextChallengeId(cp: any): Promise<number> {
  const next = (await cp.nextChallengeIdView?.()) ?? (await cp.nextChallengeId());
  return Number(next);
}

/** Voting helpers */
export async function approveAs(signer: any, cp: any, id: number | bigint) {
  await (await cp.connect(signer).approveChallenge(id, true)).wait();
}
export async function rejectAs(signer: any, cp: any, id: number | bigint) {
  await (await cp.connect(signer).approveChallenge(id, false)).wait();
}

/** Peer vote (after startTs). PASS=true means pass/approve the challenge. */
export async function peerVoteAs(signer: any, cp: any, id: number | bigint, pass = true) {
  await (await cp.connect(signer).peerVote(id, pass)).wait();
}

/** Join success-side (contribution) before startTs. */
export async function joinAs(signer: any, cp: any, id: number | bigint, amountWei: bigint) {
  await (await cp.connect(signer).joinChallenge(id, { value: amountWei })).wait();
}

/** Bet on Success (1) or Fail (2) before startTs. */
export async function betAs(
  signer: any,
  cp: any,
  id: number | bigint,
  outcome: 1 | 2,
  amountWei: bigint
) {
  await (await cp.connect(signer).betOn(id, outcome, { value: amountWei })).wait();
}

/** Finalize helper */
export async function finalize(cp: any, id: number | bigint) {
  await (await cp.finalize(id)).wait();
}

/** Claim helpers */
export async function claimWinnerAs(signer: any, cp: any, id: number | bigint) {
  await (await cp.connect(signer).claimWinner(id)).wait();
}
export async function claimLoserAs(signer: any, cp: any, id: number | bigint) {
  await (await cp.connect(signer).claimLoserCashback(id)).wait();
}
export async function claimValidatorAs(signer: any, cp: any, id: number | bigint) {
  await (await cp.connect(signer).claimValidator(id)).wait();
}

/** Snapshot convenience (typed-ish) */
export async function getSnapshot(cp: any, id: number | bigint) {
  const s = await cp.getSnapshot(id);
  return {
    set: Boolean(s.set),
    success: Boolean(s.success),
    rightSide: Number(s.rightSide),
    eligibleValidators: Number(s.eligibleValidators),
    winnersPool: BigInt(s.winnersPool),
    losersPool: BigInt(s.losersPool),
    loserCashback: BigInt(s.loserCashback),
    losersAfterCashback: BigInt(s.losersAfterCashback),
    charityAmt: BigInt(s.charityAmt),
    daoAmt: BigInt(s.daoAmt),
    creatorAmt: BigInt(s.creatorAmt),
    validatorsAmt: BigInt(s.validatorsAmt),
    perWinnerBonusX: BigInt(s.perWinnerBonusX),
    perLoserCashbackX: BigInt(s.perLoserCashbackX),
    perValidatorAmt: BigInt(s.perValidatorAmt),
  };
}