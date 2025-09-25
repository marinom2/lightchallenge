import { expect } from "chai";
import { ethers } from "hardhat";
import { deployChallengePay, stakeAs, createBasicChallenge, fastForward, configureValidatorParams } from "./helpers";

describe("ChallengePay – validator lifecycle", () => {
  it("vote lock prevents unstake; unlocks after finalize", async () => {
    const { cp } = await deployChallengePay();
    const [_, v1, v2] = await ethers.getSigners();

    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 6000 });

    await stakeAs(v1, cp);
    await stakeAs(v2, cp);
    const id = await createBasicChallenge(cp);

    const ch0 = await cp.getChallenge(id);
    expect(Number(ch0.status)).to.eq(0);

    // One vote -> should NOT auto-approve under stricter params, so lock persists
    await cp.connect(v1).approveChallenge(id, true);

    // requestUnstake should revert due to HasOpenVoteLocks
    await expect(
      cp.connect(v1).requestUnstake((await cp.minValidatorStake()) as bigint)
    ).to.be.reverted;

    // Now complete approvals and finalize to release lock
    await cp.connect(v2).approveChallenge(id, true);
    const ch = await cp.getChallenge(id);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const wait = Number(ch.startTs) - now + 1;
    if (wait > 0) await fastForward(wait);
    await cp.finalize(id);

    await cp.connect(v1).requestUnstake((await cp.minValidatorStake()) as bigint);
  });
});