import { expect } from "chai";
import { ethers } from "hardhat";
import { deployChallengePay } from "./helpers";

describe("ChallengePay – deadlines and windows", () => {
  it("reverts when approvalDeadline >= startTs", async () => {
    const { cp } = await deployChallengePay();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const lead = Number(await cp.approvalLeadTime());
    const startTs = BigInt(now + lead + 3600);
    const approvalDeadline = startTs; // invalid: equal

    await expect(
      cp.createChallenge({
        kind: 0,
        currency: 0,
        token: ethers.ZeroAddress,
        stakeAmount: ethers.parseEther("0.0001"),
        proposalBond: ethers.parseEther("0.000000000000000001"),
        approvalDeadline,
        startTs,
        maxParticipants: 10,
        peers: [],
        peerApprovalsNeeded: 0,
        charityBps: 0,
        charity: ethers.ZeroAddress,
        proofRequired: false,
        verifier: ethers.ZeroAddress
      }, { value: ethers.parseEther("0.000100000000000001") })
    ).to.be.revertedWithCustomError(cp, "ApprovalWindowTooShort");
  });

  it("reverts when startTs < now + approvalLeadTime", async () => {
    const { cp } = await deployChallengePay();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const lead = Number(await cp.approvalLeadTime());
    const startTs = BigInt(now + lead - 1); // too soon

    await expect(
      cp.createChallenge({
        kind: 0,
        currency: 0,
        token: ethers.ZeroAddress,
        stakeAmount: ethers.parseEther("0.0001"),
        proposalBond: ethers.parseEther("0.000000000000000001"),
        approvalDeadline: BigInt(now + 60),
        startTs,
        maxParticipants: 10,
        peers: [],
        peerApprovalsNeeded: 0,
        charityBps: 0,
        charity: ethers.ZeroAddress,
        proofRequired: false,
        verifier: ethers.ZeroAddress
      }, { value: ethers.parseEther("0.000100000000000001") })
    ).to.be.revertedWithCustomError(cp, "StartTooSoon");
  });
});