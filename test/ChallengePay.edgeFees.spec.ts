import { expect } from "chai";
import { ethers } from "hardhat";
import {
  configureValidatorParams,
  createBasicChallenge,
  deployChallengePay,
  stakeAs,
  fastForward,
} from "./helpers";

describe("ChallengePay – edge fee branches", () => {
  it("loser cashback disabled → perLoserCashbackX=0 but claim still callable", async () => {
    const { cp } = await deployChallengePay();
    const [deployer, v1, v2, bettor] = await ethers.getSigners();

    // Require both votes to Approve
    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 5000 });
    await stakeAs(v1, cp);
    await stakeAs(v2, cp);

    // Disable loser cashback only
    const f = await cp.feeConfig();
    await cp.setFeeConfig({
      losersFeeBps: f.losersFeeBps,
      daoBps: f.daoBps,
      creatorBps: f.creatorBps,
      validatorsBps: f.validatorsBps,
      rejectFeeBps: f.rejectFeeBps,
      rejectDaoBps: f.rejectDaoBps,
      rejectValidatorsBps: f.rejectValidatorsBps,
      loserCashbackBps: 0
    });

    const id = await createBasicChallenge(cp);
    await cp.connect(v1).approveChallenge(id, true);
    await cp.connect(v2).approveChallenge(id, true);

    await cp.joinChallenge(id, { value: ethers.parseEther("0.00005") });
    await cp.connect(bettor).betOn(id, 2, { value: ethers.parseEther("0.00004") });

    const ch = await cp.getChallenge(id);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Number(ch.startTs) - now + 1);
    await cp.finalize(id);

    const s = await cp.getSnapshot(id);
    expect(s.perLoserCashbackX).to.eq(0n);

    const tx = await cp.connect(bettor).claimLoserCashback(id);
    await tx.wait();
    await expect(tx).to.emit(cp, "LoserCashbackClaimed");
  });

  it("validatorsBps=0 → perValidatorAmt=0 → validator claims revert NotEligible", async () => {
    const { cp } = await deployChallengePay();
    const [deployer, v1, v2, bettor] = await ethers.getSigners();

    // Require both votes to Approve
    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 5000 });
    await stakeAs(v1, cp);
    await stakeAs(v2, cp);

    // Keep the loser split invariant: move validatorsBps into daoBps (sum constant)
    const f = await cp.feeConfig();
    const newDao = Number(f.daoBps) + Number(f.validatorsBps);
    await cp.setFeeConfig({
      losersFeeBps: f.losersFeeBps,
      daoBps: newDao,
      creatorBps: f.creatorBps,
      validatorsBps: 0,
      rejectFeeBps: f.rejectFeeBps,
      rejectDaoBps: f.rejectDaoBps,
      rejectValidatorsBps: f.rejectValidatorsBps,
      loserCashbackBps: f.loserCashbackBps
    });

    const id = await createBasicChallenge(cp);
    await cp.connect(v1).approveChallenge(id, true);
    await cp.connect(v2).approveChallenge(id, true);

    await cp.joinChallenge(id, { value: ethers.parseEther("0.00005") });
    await cp.connect(bettor).betOn(id, 2, { value: ethers.parseEther("0.00004") });

    const ch = await cp.getChallenge(id);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Number(ch.startTs) - now + 1);
    await cp.finalize(id);

    const s = await cp.getSnapshot(id);
    expect(s.perValidatorAmt).to.eq(0n);
    await expect(cp.connect(v1).claimValidator(id)).to.be.revertedWithCustomError(cp, "NotEligible");
  });
});