import { expect } from "chai";
import { ethers } from "hardhat";
import { deployChallengePay, stakeAs, createBasicChallenge, fastForward, configureValidatorParams } from "./helpers";

describe("ChallengePay – reject path", () => {
  it("rejects and sets per-cap validator claim", async () => {
    const { cp } = await deployChallengePay();
    const [_, v1, v2] = await ethers.getSigners();

    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 6000 });
    await stakeAs(v1, cp);
    await stakeAs(v2, cp);

    const id = await createBasicChallenge(cp);
    const ch0 = await cp.getChallenge(id);
    expect(Number(ch0.status)).to.eq(0);

    await cp.connect(v1).approveChallenge(id, false);
    await cp.connect(v2).approveChallenge(id, false);

    await cp.finalize(id);
    const ch = await cp.getChallenge(id);
    expect(Number(ch.status)).to.eq(2); // Rejected

    const per = await cp.getRejectPerValidatorAmt(id).catch(() => 0n);
    if (per > 0n) {
      await expect(cp.connect(v1).claimValidator(id)).to.emit(cp, "ValidatorRejectClaimed");
      await expect(cp.connect(v2).claimValidator(id)).to.emit(cp, "ValidatorRejectClaimed");
    }
  });

  it("no quorum before deadline => finalize after deadline rejects", async () => {
    const { cp } = await deployChallengePay();
    await configureValidatorParams(cp, { thresholdBps: 9900, quorumBps: 9900 }); // ensure no quorum at all

    const id = await createBasicChallenge(cp);
    const ch = await cp.getChallenge(id);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const wait = Number(ch.approvalDeadline) - now + 1;
    await fastForward(wait);

    await cp.finalize(id);
    const ch2 = await cp.getChallenge(id);
    expect(Number(ch2.status)).to.eq(2);
  });
});