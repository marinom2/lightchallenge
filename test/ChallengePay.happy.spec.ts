import { expect } from "chai";
import { ethers } from "hardhat";
import { deployChallengePay, stakeAs, createBasicChallenge, fastForward, configureValidatorParams } from "./helpers";

describe("ChallengePay – happy path", () => {
  it("finalizes success and pays claims", async () => {
    const { cp } = await deployChallengePay();
    const [deployer, v1, v2, bettor] = await ethers.getSigners();

    // Make governance strict to avoid single-vote auto-approval
    await configureValidatorParams(cp, { thresholdBps: 6000, quorumBps: 6000 });

    // Stake validators
    await stakeAs(v1, cp);
    await stakeAs(v2, cp);

    const id = await createBasicChallenge(cp);

    // Ensure Pending
    const ch0 = await cp.getChallenge(id);
    expect(Number(ch0.status)).to.eq(0);

    // Approvals (won't flip status until both have voted under stricter params)
    await cp.connect(v1).approveChallenge(id, true);
    await cp.connect(v2).approveChallenge(id, true);

    // Join success & bet fail
    await cp.connect(deployer).joinChallenge(id, { value: ethers.parseEther("0.00005") });
    await cp.connect(bettor).betOn(id, 2, { value: ethers.parseEther("0.00004") }); // Fail

    // Advance to startTs
    const ch = await cp.getChallenge(id);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const wait = Number(ch.startTs) - now + 1;
    if (wait > 0) await fastForward(wait);

    // Finalize => Success
    await cp.finalize(id);
    const snap = await cp.getSnapshot(id);
    expect(snap.set).to.eq(true);
    expect(snap.success).to.eq(true);

    // Claims
    await expect(cp.connect(deployer).claimWinner(id)).to.emit(cp, "WinnerClaimed");
    await expect(cp.connect(bettor).claimLoserCashback(id)).to.emit(cp, "LoserCashbackClaimed");
    await expect(cp.connect(v1).claimValidator(id)).to.emit(cp, "ValidatorClaimed");
    await expect(cp.connect(v2).claimValidator(id)).to.emit(cp, "ValidatorClaimed");
  });
});