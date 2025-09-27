import { expect } from "chai"
import { ethers } from "hardhat"
import type { ChallengePay, Treasury } from "../typechain-types"

describe("ChallengePay: events", () => {
  let cp: ChallengePay
  let treasury: Treasury
  let owner: any, u1: any

  beforeEach(async () => {
    [owner, u1] = await ethers.getSigners()
    const T = await ethers.getContractFactory("Treasury")
    treasury = await T.deploy(owner.address, owner.address)
    await treasury.waitForDeployment()

    const C = await ethers.getContractFactory("ChallengePay")
    cp = await C.deploy(await treasury.getAddress())
    await cp.waitForDeployment()
  })

  it("emits ChallengeCreated", async () => {
    const now = BigInt(Math.floor(Date.now() / 1000))
    const start = now + 72n * 3600n + 3600n
    const approvalDeadline = now + 3600n

    const p = {
      kind: 1,
      currency: 0,              // NATIVE
      token: ethers.ZeroAddress,
      stakeAmount: ethers.parseEther("0.01"),
      proposalBond: ethers.parseEther("0.002"),
      approvalDeadline: approvalDeadline,
      startTs: start,
      maxParticipants: 0,
      peers: [] as string[],
      peerApprovalsNeeded: 0,
      charityBps: 0,
      charity: ethers.ZeroAddress,
      proofRequired: false,
      verifier: ethers.ZeroAddress,
    }

    const value = p.stakeAmount + p.proposalBond

    await expect(cp.createChallenge(p, { value }))
      .to.emit(cp, "ChallengeCreated")
      .withArgs(0, await owner.getAddress(), p.kind, p.startTs)
  })
})