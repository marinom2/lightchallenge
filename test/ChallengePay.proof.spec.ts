import { expect } from "chai";
import { ethers } from "hardhat";
import { stakeAs, latestTimestamp, fastForward, configureValidatorParams } from "./helpers";

describe("ChallengePay – proof required", () => {
  it("requires proof before finalize, then succeeds after submit", async () => {
    const [deployer, v1, v2] = await ethers.getSigners();

    const VF = await ethers.getContractFactory("MockProofVerifier");
    const mock = await VF.deploy();
    await mock.waitForDeployment();

    const F = await ethers.getContractFactory("ChallengePay");
    const cp = await F.deploy(deployer.address);
    await cp.waitForDeployment();

    await (await cp.setApprovalLeadTime(60)).wait();
    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 6000 });

    await stakeAs(v1, cp);
    await stakeAs(v2, cp);

    const now = await latestTimestamp();
    const lead = Number(await cp.approvalLeadTime());

    const params = {
      kind: 0,
      currency: 0,
      token: ethers.ZeroAddress,
      stakeAmount: ethers.parseEther("0.0001"),
      proposalBond: ethers.parseEther("0.000000000000000001"),
      approvalDeadline: BigInt(now + 900),
      startTs: BigInt(now + lead + 1200),
      maxParticipants: 10,
      peers: [] as string[],
      peerApprovalsNeeded: 0,
      charityBps: 0,
      charity: ethers.ZeroAddress,
      proofRequired: true,
      verifier: await mock.getAddress(),
    };
    const value = (params.stakeAmount as bigint) + (params.proposalBond as bigint);
    await (await cp.createChallenge(params, { value })).wait();

    const next = (await cp.nextChallengeIdView?.()) ?? (await cp.nextChallengeId());
    const id = Number(next - 1n);

    const ch0 = await cp.getChallenge(id);
    expect(Number(ch0.status)).to.eq(0);

    await cp.connect(v1).approveChallenge(id, true);
    await cp.connect(v2).approveChallenge(id, true);

    const wait = Number(params.startTs) - (await latestTimestamp()) + 1;
    if (wait > 0) await fastForward(wait);

    await expect(cp.finalize(id)).to.be.reverted; // ProofRequired

    const ch = await cp.getChallenge(id);
    await mock.setApproved(id, ch.challenger, true);

    await cp.submitProof(id, "0x01");
    await cp.finalize(id);

    const snap = await cp.getSnapshot(id);
    expect(snap.set).to.eq(true);
    expect(snap.success).to.eq(true);
  });
});