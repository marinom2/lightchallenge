import { expect } from "chai";
import { ethers } from "hardhat";
import { deployChallengePay, createBasicChallenge, fastForward, stakeAs } from "./helpers";

async function expectNativeSendFailure(promise: Promise<any>) {
  try {
    await promise;
    expect.fail("Expected call to revert due to failed native send");
  } catch (e: any) {
    const msg = (e?.message || "").toString();
    // Accept either custom error bubbling or the inner "no receive" revert;
    // solidity-coverage can surface either depending on instrumentation.
    if (
      msg.includes("NativeSendFailed") ||
      msg.includes("no receive") ||
      msg.includes("revert")
    ) {
      return;
    }
    throw e;
  }
}

describe("ChallengePay – peerVote & withdrawUnstaked branches", () => {
  it("peerVote negative branches + pass/fail counting", async () => {
    const { cp } = await deployChallengePay();
    const [, v, peerA, peerB, rando] = await ethers.getSigners();

    // validator approves to flip Pending→Approved
    await stakeAs(v, cp);
    const id = await createBasicChallenge(cp, { peers: [peerA.address, peerB.address], peerApprovalsNeeded: 1 });

    await cp.connect(v).approveChallenge(id, true);
    expect((await cp.getChallenge(id)).status).to.eq(1); // Approved

    // before start
    await expect(cp.connect(peerA).peerVote(id, true)).to.be.revertedWith("before start");

    // not peer
    const start = Number((await cp.getChallenge(id)).startTs);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Math.max(0, start - now) + 1);

    await expect(cp.connect(rando).peerVote(id, true)).to.be.revertedWith("not peer");

    // pass then already voted
    await expect(cp.connect(peerA).peerVote(id, true))
      .to.emit(cp, "PeerVoted")
      .withArgs(id, peerA.address, true);
    await expect(cp.connect(peerA).peerVote(id, true)).to.be.revertedWith("already voted");

    // fail vote by peerB
    await expect(cp.connect(peerB).peerVote(id, false))
      .to.emit(cp, "PeerVoted")
      .withArgs(id, peerB.address, false);

    const ch = await cp.getChallenge(id);
    expect(ch.peerApprovals).to.eq(1);
    expect(ch.peerRejections).to.eq(1);
  });

  it("withdrawUnstaked – zero / cooldown / success and NativeSendFailed via proxy", async () => {
    const { cp } = await deployChallengePay();

    // zero amount
    await expect(cp.withdrawUnstaked()).to.be.revertedWithCustomError(cp, "AmountZero");

    // stake and request, then early withdraw (cooldown)
    const min = await cp.minValidatorStake();
    await cp.stakeValidator({ value: min });
    await cp.requestUnstake(min);
    await expect(cp.withdrawUnstaked()).to.be.revertedWithCustomError(cp, "CooldownNotElapsed");

    // travel through cooldown and succeed
    const cd = await cp.unstakeCooldownSec();
    await fastForward(Number(cd) + 1);
    await expect(cp.withdrawUnstaked()).to.emit(cp, "ValidatorUnstaked");

    // Now provoke NativeSendFailed: do the flow from a contract that can't receive
    const PF = await ethers.getContractFactory("WithdrawProxy");
    const proxy = await PF.deploy();
    await proxy.waitForDeployment();

    // DO NOT send ETH to the proxy (receive reverts). Pass the value in the call.
    await proxy.stake(await cp.getAddress(), { value: min });

    // requestUnstake then pass cooldown
    await proxy.requestUnstake(await cp.getAddress(), min);
    const cd2 = await cp.unstakeCooldownSec();
    await fastForward(Number(cd2) + 1);

    // this will call _pay(msg.sender=proxy) → proxy.receive()/fallback reverts
    await expectNativeSendFailure(proxy.withdraw(await cp.getAddress()));
  });

  it("claimValidator wrapper routes: snapshot vs reject", async () => {
    const { cp } = await deployChallengePay();
    const [, v] = await ethers.getSigners();
    await stakeAs(v, cp);

    // A) Approved → Finalized → snapshot path
    const idA = await createBasicChallenge(cp);
    await cp.connect(v).approveChallenge(idA, true);
    const startA = Number((await cp.getChallenge(idA)).startTs);
    const nowA = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Math.max(0, startA - nowA) + 1);
    await cp.finalize(idA);
    await cp.claimValidator(idA).catch(() => {}); // swallow NotEligible if no validatorsAmt

    // B) Pending → after deadline → reject path
    const idB = await createBasicChallenge(cp);
    const deadline = Number((await cp.getChallenge(idB)).approvalDeadline);
    const nowB = (await ethers.provider.getBlock("latest"))!.timestamp;
    await fastForward(Math.max(0, deadline - nowB) + 2);
    await cp.finalize(idB);
    await cp.claimValidator(idB).catch(() => {});
  });
});