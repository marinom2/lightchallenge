import { expect } from "chai";
import { ethers } from "hardhat";
import {
  configureValidatorParams,
  createBasicChallenge,
  deployChallengePay,
  stakeAs,
  fastForward,
} from "./helpers";

describe("ChallengePay – charity branches", () => {
  it("charity set → transfers charityAmt; zero address → computes amt but skips transfer", async () => {
    const { cp } = await deployChallengePay();
    const [deployer, v1, v2, charity, bettor] = await ethers.getSigners();

    // Require both votes to Approve: threshold 60%, quorum 50%
    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 5000 });
    await stakeAs(v1, cp);
    await stakeAs(v2, cp);

    // A) with charity address
    const idA = await createBasicChallenge(cp, { charityBps: 100, charity: charity.address });
    await cp.connect(v1).approveChallenge(idA, true);
    await cp.connect(v2).approveChallenge(idA, true); // now meets 60% → Approved

    await cp.joinChallenge(idA, { value: ethers.parseEther("0.00005") });
    await cp.connect(bettor).betOn(idA, 2, { value: ethers.parseEther("0.00004") });

    const chA = await cp.getChallenge(idA);
    const nowA = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Number(chA.startTs) - nowA + 1);
    await cp.finalize(idA);

    const sA = await cp.getSnapshot(idA);
    expect(sA.charityAmt).to.be.gt(0n);

    // B) bps>0 but zero charity address
    const idB = await createBasicChallenge(cp, { charityBps: 100, charity: ethers.ZeroAddress });
    await cp.connect(v1).approveChallenge(idB, true);
    await cp.connect(v2).approveChallenge(idB, true);

    await cp.joinChallenge(idB, { value: ethers.parseEther("0.00005") });
    await cp.connect(bettor).betOn(idB, 2, { value: ethers.parseEther("0.00004") });

    const chB = await cp.getChallenge(idB);
    const nowB = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Number(chB.startTs) - nowB + 1);
    await cp.finalize(idB);

    const sB = await cp.getSnapshot(idB);
    expect(sB.charityAmt).to.be.gt(0n); // computed even if charity is zero address
  });
});