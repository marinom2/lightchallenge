import { expect } from "chai";
import { ethers } from "hardhat";
import { deployChallengePay, createBasicChallenge, stakeAs } from "./helpers";

describe("ChallengePay – safety checks", () => {
  it("rejects wrong msg.value on create", async () => {
    const { cp } = await deployChallengePay();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await (await cp.setApprovalLeadTime(60)).wait();

    const lead = Number(await cp.approvalLeadTime());
    const params = {
      kind: 0, currency: 0, token: ethers.ZeroAddress,
      stakeAmount: ethers.parseEther("0.0001"),
      proposalBond: ethers.parseEther("0.000000000000000001"),
      approvalDeadline: BigInt(now + 120),
      startTs: BigInt(now + lead + 600),
      maxParticipants: 5, peers: [] as string[], peerApprovalsNeeded: 0,
      charityBps: 0, charity: ethers.ZeroAddress, proofRequired: false, verifier: ethers.ZeroAddress
    };
    // Missing proposalBond in value
    await expect(cp.createChallenge(params, { value: params.stakeAmount })).to.be.reverted;
  });

  it("enforces participant cap (unique wallets)", async () => {
    const { cp } = await deployChallengePay();
    const [creator, v1, other] = await ethers.getSigners();

    await stakeAs(v1, cp);

    const id = await createBasicChallenge(cp, { maxParticipants: 1 });

    await cp.connect(v1).approveChallenge(id, true); // Approved after quorum

    await expect(cp.connect(creator).joinChallenge(id, { value: ethers.parseEther("0.00001") }))
      .to.emit(cp, "Joined");

    await expect(
      cp.connect(other).joinChallenge(id, { value: ethers.parseEther("0.00001") })
    ).to.be.reverted; // MaxParticipantsReached
  });
});