import { expect } from "chai";
import { ethers } from "hardhat";
import {
  configureValidatorParams,
  createBasicChallenge,
  deployChallengePay,
} from "./helpers";

describe("ChallengePay – pause & cancel", () => {
  it("pause blocks join/bet; cancel while Pending triggers refund path", async () => {
    const { cp } = await deployChallengePay();

    // Keep it Pending (no quorum/threshold met)
    await configureValidatorParams(cp, { thresholdBps: 9000, quorumBps: 9000 });

    const id = await createBasicChallenge(cp);

    await cp.pauseChallenge(id, true);
    await expect(cp.joinChallenge(id, { value: ethers.parseEther("0.00001") }))
      .to.be.revertedWithCustomError(cp, "PausedOrCanceled");
    await expect(cp.betOn(id, 2, { value: ethers.parseEther("0.00001") }))
      .to.be.revertedWithCustomError(cp, "PausedOrCanceled");

    await expect(cp.cancelChallenge(id)).to.emit(cp, "Canceled");
    const ch = await cp.getChallenge(id);
    expect(Number(ch.status)).to.eq(2); // Rejected
  });
});