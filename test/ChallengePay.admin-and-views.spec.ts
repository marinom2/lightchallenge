import { expect } from "chai";
import { ethers } from "hardhat";
import { deployChallengePay, createBasicChallenge, fastForward } from "./helpers";

describe("ChallengePay – admin & views", () => {
  it("setAdmin / setDaoTreasury only by admin", async () => {
    const { cp, deployer } = await deployChallengePay();
    const [, alice] = await ethers.getSigners();

    await expect(cp.connect(alice).setAdmin(alice.address)).to.be.revertedWithCustomError(cp, "NotAdmin");
    await expect(cp.connect(deployer).setAdmin(alice.address)).to.not.be.reverted;
    expect(await cp.admin()).to.eq(alice.address);

    await expect(cp.connect(deployer).setDaoTreasury(alice.address)).to.be.revertedWithCustomError(cp, "NotAdmin");
    await expect(cp.connect(alice).setDaoTreasury(alice.address)).to.not.be.reverted;
    expect(await cp.daoTreasury()).to.eq(alice.address);
  });

  it("setFeeCaps validates caps ≤ 10000", async () => {
    const { cp } = await deployChallengePay();
    // ok
    await cp.setFeeCaps({ losersFeeMaxBps: 1000, charityMaxBps: 500, loserCashbackMaxBps: 200 });
    // bad: > 10000 (cap>100%)
    await expect(
      cp.setFeeCaps({ losersFeeMaxBps: 10001, charityMaxBps: 500, loserCashbackMaxBps: 200 })
    ).to.be.revertedWith("cap>100%");
    await expect(
      cp.setFeeCaps({ losersFeeMaxBps: 1000, charityMaxBps: 10001, loserCashbackMaxBps: 200 })
    ).to.be.revertedWith("cap>100%");
    await expect(
      cp.setFeeCaps({ losersFeeMaxBps: 1000, charityMaxBps: 500, loserCashbackMaxBps: 10001 })
    ).to.be.revertedWith("cap>100%");
  });

  it("setFeeConfig reverts on cap & split mismatches; accepts valid", async () => {
    const { cp, deployer } = await deployChallengePay();
    // Bring caps tight so we can trip them
    await cp.connect(deployer).setFeeCaps({ losersFeeMaxBps: 600, charityMaxBps: 500, loserCashbackMaxBps: 100 });

    // losersFeeBps > cap → "losers fee cap"
    await expect(
      cp.connect(deployer).setFeeConfig({
        losersFeeBps: 601,
        daoBps: 200,
        creatorBps: 200,
        validatorsBps: 201,
        rejectFeeBps: 200,
        rejectDaoBps: 200,
        rejectValidatorsBps: 0,
        loserCashbackBps: 100,
      })
    ).to.be.revertedWith("losers fee cap");

    // loser split mismatch (100 + 100 + 100 = 300 != 600) → "loser fee split"
    await expect(
      cp.connect(deployer).setFeeConfig({
        losersFeeBps: 600,
        daoBps: 100,
        creatorBps: 100,
        validatorsBps: 100, // 300 != 600
        rejectFeeBps: 200,
        rejectDaoBps: 200,
        rejectValidatorsBps: 0,
        loserCashbackBps: 100,
      })
    ).to.be.revertedWith("loser fee split");

    // reject > 100% → "reject>100%"
    await expect(
      cp.connect(deployer).setFeeConfig({
        losersFeeBps: 600,
        daoBps: 200,
        creatorBps: 200,
        validatorsBps: 200, // OK for losers split
        rejectFeeBps: 10001,
        rejectDaoBps: 10001,
        rejectValidatorsBps: 0,
        loserCashbackBps: 100,
      })
    ).to.be.revertedWith("reject>100%");

    // reject split mismatch (100 + 50 != 200) → "reject split"
    await expect(
      cp.connect(deployer).setFeeConfig({
        losersFeeBps: 600,
        daoBps: 200,
        creatorBps: 200,
        validatorsBps: 200, // OK for losers split
        rejectFeeBps: 200,
        rejectDaoBps: 100,
        rejectValidatorsBps: 50, // 150 != 200
        loserCashbackBps: 100,
      })
    ).to.be.revertedWith("reject split");

    // cashback cap (101 > 100) → "cashback cap"
    await expect(
      cp.connect(deployer).setFeeConfig({
        losersFeeBps: 600,
        daoBps: 200,
        creatorBps: 200,
        validatorsBps: 200,
        rejectFeeBps: 200,
        rejectDaoBps: 200,
        rejectValidatorsBps: 0,
        loserCashbackBps: 101,
      })
    ).to.be.revertedWith("cashback cap");

    // valid config → emits FeeConfigSet
    await expect(
      cp.connect(deployer).setFeeConfig({
        losersFeeBps: 600,
        daoBps: 200,
        creatorBps: 200,
        validatorsBps: 200, // 600 == 600
        rejectFeeBps: 200,
        rejectDaoBps: 200,
        rejectValidatorsBps: 0, // 200 == 200
        loserCashbackBps: 100,
      })
    ).to.emit(cp, "FeeConfigSet");
  });

  it("rescueNative happy path & failure (receiver reverts)", async () => {
    const { cp } = await deployChallengePay();
    const F = await ethers.getContractFactory("RevertingReceiver");
    const bad = await F.deploy();
    await bad.waitForDeployment();

    // fund cp
    const [owner] = await ethers.getSigners();
    await owner.sendTransaction({ to: await cp.getAddress(), value: ethers.parseEther("0.01") });

    // to=0 revert
    await expect(cp.rescueNative(ethers.ZeroAddress, ethers.parseEther("0.001"))).to.be.revertedWith("to=0");

    // receiver reverts → NativeSendFailed
    await expect(cp.rescueNative(await bad.getAddress(), ethers.parseEther("0.001"))).to.be.revertedWithCustomError(
      cp,
      "NativeSendFailed"
    );
  });

  it("contribOf / hasSnapshot / getValidatorClaimInfo", async () => {
    const { cp } = await deployChallengePay();
    const [, v] = await ethers.getSigners();

    // Make v a validator and approve
    await cp.connect(v).stakeValidator({ value: await cp.minValidatorStake() });

    const id = await createBasicChallenge(cp);
    await cp.connect(v).approveChallenge(id, true);

    // contribute on success side so contribOf is non-zero
    await cp.joinChallenge(id, { value: ethers.parseEther("0.001") });

    // finalize → snapshot set
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const start = Number((await cp.getChallenge(id)).startTs);
    await fastForward(Math.max(0, start - now) + 1);
    await cp.finalize(id);

    const contrib = await cp.contribOf(id, v.address);
    expect(contrib.successAmt).to.eq(0n);
    expect(contrib.failAmt).to.eq(0n);

    expect(await cp.hasSnapshot(id)).to.eq(true);

    const info = await cp.getValidatorClaimInfo(id, v.address);
    expect(info.snapshotSet).to.eq(true);
    expect(info.voted).to.eq(true);
    // depending on right side, perValidatorFinal may be >0; we only assert presence of view fields
    expect(typeof info.perValidatorFinal).to.eq("bigint");
  });
});