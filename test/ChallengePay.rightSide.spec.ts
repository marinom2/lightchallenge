import { expect } from "chai";
import { ethers } from "hardhat";
import {
  configureValidatorParams,
  createBasicChallenge,
  deployChallengePay,
  stakeAs,
  fastForward,
} from "./helpers";

describe("ChallengePay – right-side validator eligibility", () => {
  it("only validators on the right side can claim after Success", async () => {
    const { cp } = await deployChallengePay();
    const [deployer, vYes, vNo, bettor] = await ethers.getSigners();

    // 3 validators → each ~33%. threshold 60% requires 2 aligned yes votes.
    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 5000 });
    await stakeAs(vYes, cp);
    await stakeAs(vNo, cp);
    await stakeAs(deployer, cp);

    const id = await createBasicChallenge(cp);

    // Record both sides first, then flip to Approved with third yes
    await cp.connect(vYes).approveChallenge(id, true);   // ~33% yes
    await cp.connect(vNo).approveChallenge(id, false);   // ~33% no
    await cp.connect(deployer).approveChallenge(id, true); // yes total ~66% → Approved

    await cp.joinChallenge(id, { value: ethers.parseEther("0.00005") });
    await cp.connect(bettor).betOn(id, 2, { value: ethers.parseEther("0.00004") });

    const ch = await cp.getChallenge(id);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Number(ch.startTs) - now + 1);
    await cp.finalize(id);

    // Success → right side = Approval
    await expect(cp.connect(vYes).claimValidator(id)).to.emit(cp, "ValidatorClaimed");
    await expect(cp.connect(vNo).claimValidator(id)).to.be.revertedWithCustomError(cp, "NotEligible");
  });

  it("only validators on the right side can claim after Fail", async () => {
    const { cp } = await deployChallengePay();
    const [deployer, vYes, vNo, bettor] = await ethers.getSigners();

    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 5000 });
    await stakeAs(vYes, cp);
    await stakeAs(vNo, cp);
    await stakeAs(deployer, cp);

    const id = await createBasicChallenge(cp);

    // Two 'no' votes reach ~66% → Rejected (status), both recorded
    await cp.connect(vNo).approveChallenge(id, false);
    await cp.connect(deployer).approveChallenge(id, false);

    const ch0 = await cp.getChallenge(id);
    const now0 = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Number(ch0.startTs) - now0 + 1);

    // Finalize after startTs → Fail outcome with snapshot
    await cp.finalize(id);

    // Fail → right side = Reject
    await expect(cp.connect(vNo).claimValidator(id)).to.emit(cp, "ValidatorClaimed");
    await expect(cp.connect(vYes).claimValidator(id)).to.be.revertedWithCustomError(cp, "NotEligible");
  });
});