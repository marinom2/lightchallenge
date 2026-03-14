import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const ONE_ETH = ethers.parseEther("1");
const ONE_HOUR = 3600;
const ONE_DAY = 86400;

async function deployFixture() {
  const [deployer, admin, protocol, creator, alice, bob] = await ethers.getSigners();

  // Treasury
  const Treasury = await ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy(admin.address, ethers.ZeroAddress);
  await treasury.waitForDeployment();

  // ChallengePay
  const CP = await ethers.getContractFactory("ChallengePay");
  const cp = await CP.deploy(await treasury.getAddress(), protocol.address);
  await cp.waitForDeployment();

  // Admin transfer
  await cp.connect(deployer).transferAdmin(admin.address);
  await cp.connect(admin).acceptAdmin();

  // Grant OPERATOR_ROLE
  const OPERATOR_ROLE = await treasury.OPERATOR_ROLE();
  await treasury.connect(admin).grantRole(OPERATOR_ROLE, await cp.getAddress());

  // MetadataRegistry
  const MR = await ethers.getContractFactory("MetadataRegistry");
  const mr = await MR.deploy(deployer.address);
  await mr.waitForDeployment();

  // MockVerifier
  const MV = await ethers.getContractFactory("MockVerifier");
  const mockVerifier = await MV.deploy();
  await mockVerifier.waitForDeployment();

  // EventChallengeRouter
  const ECR = await ethers.getContractFactory("EventChallengeRouter");
  const router = await ECR.deploy(await cp.getAddress(), await mr.getAddress());
  await router.waitForDeployment();

  // Register router as dispatcher on ChallengePay (SC-H1 requirement)
  await cp.connect(admin).setDispatcher(await router.getAddress(), true);

  return { deployer, admin, protocol, creator, alice, bob, treasury, cp, mr, mockVerifier, router };
}

/** Create a native challenge on ChallengePay, returns the challenge ID. */
async function createChallenge(
  cp: any,
  signer: any,
  verifierAddr: string,
  stakeAmount: bigint = ONE_ETH
): Promise<bigint> {
  const now = BigInt(await time.latest());
  const startTs = now + BigInt(ONE_HOUR);
  const duration = BigInt(ONE_DAY);
  const endTime = startTs + duration;

  const params = {
    kind: 1,
    currency: 0,
    token: ethers.ZeroAddress,
    stakeAmount,
    joinClosesTs: 0n,
    startTs,
    duration,
    maxParticipants: 0n,
    verifier: verifierAddr,
    proofDeadlineTs: endTime + BigInt(ONE_HOUR),
    externalId: ethers.ZeroHash,
  };

  const tx = await cp.connect(signer).createChallenge(params, { value: stakeAmount });
  const receipt = await tx.wait();
  const logs = receipt!.logs;
  // Parse ChallengeCreated event to get ID
  const iface = cp.interface;
  for (const log of logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed && parsed.name === "ChallengeCreated") {
        return parsed.args.id;
      }
    } catch {}
  }
  throw new Error("ChallengeCreated event not found");
}

describe("EventChallengeRouter", function () {

  // ═══════════════════════════════════════════════════════════════════════════
  // Deployment
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Deployment", function () {
    it("sets owner, challengePay, registry correctly", async function () {
      const { router, cp, mr, deployer } = await loadFixture(deployFixture);
      expect(await router.owner()).to.equal(deployer.address);
      expect(await router.challengePay()).to.equal(await cp.getAddress());
      expect(await router.registry()).to.equal(await mr.getAddress());
    });

    it("reverts on zero-address constructor args", async function () {
      const ECR = await ethers.getContractFactory("EventChallengeRouter");
      await expect(ECR.deploy(ethers.ZeroAddress, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(ECR, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Event Registration
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Event Registration", function () {
    it("registers event and emits EventRegistered", async function () {
      const { router } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("match-1"));

      await expect(router.registerEvent(eventId, "Team A vs Team B"))
        .to.emit(router, "EventRegistered")
        .withArgs(eventId, "Team A vs Team B");
    });

    it("cannot register same event twice", async function () {
      const { router } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("match-1"));
      await router.registerEvent(eventId, "Match 1");
      await expect(router.registerEvent(eventId, "Match 1 again"))
        .to.be.revertedWithCustomError(router, "EventExists");
    });

    it("non-owner cannot register", async function () {
      const { router, alice } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("match-1"));
      await expect(router.connect(alice).registerEvent(eventId, "Match"))
        .to.be.revertedWithCustomError(router, "NotOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Add Outcome
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Add Outcome", function () {
    it("adds outcomes and emits events", async function () {
      const { router, alice, bob } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("match-1"));
      await router.registerEvent(eventId, "Match 1");

      await expect(router.addOutcome(eventId, "Team A wins", 42, alice.address))
        .to.emit(router, "OutcomeAdded")
        .withArgs(eventId, 0, "Team A wins", 42, alice.address);

      await router.addOutcome(eventId, "Team B wins", 43, bob.address);
      expect(await router.outcomesCount(eventId)).to.equal(2);
    });

    it("reverts for non-existent event", async function () {
      const { router, alice } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("nope"));
      await expect(router.addOutcome(eventId, "X", 1, alice.address))
        .to.be.revertedWithCustomError(router, "EventMissing");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Finalize Event — Integration with ChallengePay
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Finalize Event (Integration)", function () {

    it("submits proof for correct subject and finalizes challenge", async function () {
      const { router, deployer, cp, admin, creator, alice, mockVerifier } =
        await loadFixture(deployFixture);

      const vAddr = await mockVerifier.getAddress();

      // Create challenge with proofDeadlineTs = endTime so both proof + finalize
      // can succeed in the same tx at exactly proofDeadlineTs.
      const now = BigInt(await time.latest());
      const startTs = now + BigInt(ONE_HOUR);
      const duration = BigInt(ONE_DAY);
      const endTime = startTs + duration;

      const params = {
        kind: 1, currency: 0, token: ethers.ZeroAddress,
        stakeAmount: ONE_ETH, joinClosesTs: 0n, startTs, duration,
        maxParticipants: 0n, verifier: vAddr,
        proofDeadlineTs: endTime + 1n, // proof still open at endTime+1 (check is >)
        externalId: ethers.ZeroHash,
      };
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      const challengeId = (await cp.nextChallengeId()) - 1n;

      // Alice joins
      await cp.connect(alice).joinChallengeNative(challengeId, { value: ONE_ETH });

      // Register event with outcome pointing to creator as subject
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("event-1"));
      await router.registerEvent(eventId, "Test Event");
      await router.addOutcome(eventId, "Creator wins", challengeId, creator.address);

      // Advance to endTime. Next block (the finalizeEvent tx) executes at endTime+1.
      // At endTime+1: proof check (> proofDeadlineTs i.e. > endTime+1) = false → open.
      // Finalize check (< endTime) = false, (< proofDeadlineTs i.e. < endTime+1) = false → passes.
      await time.increaseTo(Number(endTime));

      // Finalize event — router calls submitProofFor(challengeId, creator, proof) + finalize
      await router.finalizeEvent(eventId, 0, "0x");

      // Verify challenge is finalized with success (creator is winner via MockVerifier)
      const final_ = await cp.getChallenge(challengeId);
      expect(final_.status).to.equal(1); // Finalized
      expect(final_.outcome).to.equal(1); // Success (creator won)
      expect(await cp.isWinner(challengeId, creator.address)).to.be.true;
    });

    it("handles proof submission failure gracefully (try/catch)", async function () {
      const { router, cp, creator, alice, mockVerifier } =
        await loadFixture(deployFixture);

      const vAddr = await mockVerifier.getAddress();
      const challengeId = await createChallenge(cp, creator, vAddr);
      await cp.connect(alice).joinChallengeNative(challengeId, { value: ONE_ETH });

      const eventId = ethers.keccak256(ethers.toUtf8Bytes("event-2"));
      await router.registerEvent(eventId, "Test Event 2");
      // subject = alice (not creator) — alice has contribution, proof will succeed
      await router.addOutcome(eventId, "Alice wins", challengeId, alice.address);

      // Advance to proof window, submit proof for alice directly first
      const c = await cp.getChallenge(challengeId);
      await time.increaseTo(Number(c.startTs) + 1);
      await cp.connect(alice).submitMyProof(challengeId, "0x");

      // Advance past proof deadline
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);

      // Router tries submitProofFor again (AlreadyWinner), but try/catch absorbs it
      // Then finalize succeeds
      await router.finalizeEvent(eventId, 0, "0x");

      const final_ = await cp.getChallenge(challengeId);
      expect(final_.status).to.equal(1); // Finalized
      expect(await cp.isWinner(challengeId, alice.address)).to.be.true;
    });

    it("reverts if event doesn't exist", async function () {
      const { router } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("nope"));
      await expect(router.finalizeEvent(eventId, 0, "0x"))
        .to.be.revertedWithCustomError(router, "EventMissing");
    });

    it("reverts if already finalized", async function () {
      const { router, cp, creator, alice, mockVerifier } =
        await loadFixture(deployFixture);

      const vAddr = await mockVerifier.getAddress();
      const challengeId = await createChallenge(cp, creator, vAddr);
      await cp.connect(alice).joinChallengeNative(challengeId, { value: ONE_ETH });

      const eventId = ethers.keccak256(ethers.toUtf8Bytes("event-3"));
      await router.registerEvent(eventId, "Test 3");
      await router.addOutcome(eventId, "Creator wins", challengeId, creator.address);

      const c = await cp.getChallenge(challengeId);
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);

      await router.finalizeEvent(eventId, 0, "0x");
      await expect(router.finalizeEvent(eventId, 0, "0x"))
        .to.be.revertedWithCustomError(router, "AlreadyFinalized");
    });

    it("reverts on bad winner index", async function () {
      const { router } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("event-4"));
      await router.registerEvent(eventId, "Test 4");
      await expect(router.finalizeEvent(eventId, 0, "0x"))
        .to.be.revertedWithCustomError(router, "BadIndex");
    });

    it("non-owner cannot finalize", async function () {
      const { router, alice } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("event-5"));
      await router.registerEvent(eventId, "Test 5");
      await expect(router.connect(alice).finalizeEvent(eventId, 0, "0x"))
        .to.be.revertedWithCustomError(router, "NotOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getEvent view
  // ═══════════════════════════════════════════════════════════════════════════
  describe("getEvent", function () {
    it("returns correct event data", async function () {
      const { router, alice } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("view-test"));
      await router.registerEvent(eventId, "View Test");
      await router.addOutcome(eventId, "Outcome A", 10, alice.address);

      // ethers v6 `contract.getEvent()` conflicts with a built-in method,
      // so call via the contract's getFunction interface.
      const result = await router.getFunction("getEvent(bytes32)").staticCall(eventId);
      expect(result.title).to.equal("View Test");
      expect(result.metaURI).to.equal("");
      expect(result.finalized).to.be.false;
      expect(result.winnerIndex).to.equal(0);
      expect(result.outcomes.length).to.equal(1);
      expect(result.outcomes[0].name).to.equal("Outcome A");
      expect(result.outcomes[0].challengeId).to.equal(10);
      expect(result.outcomes[0].subject).to.equal(alice.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Finalize Losing Outcomes (SC-M7)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("finalizeLosingOutcomes (SC-M7)", function () {

    it("finalizes losing challenges after event resolution", async function () {
      const { router, cp, admin, creator, alice, bob, mockVerifier } =
        await loadFixture(deployFixture);

      const vAddr = await mockVerifier.getAddress();

      // Create 3 challenges (one per outcome)
      const id1 = await createChallenge(cp, creator, vAddr);
      const id2 = await createChallenge(cp, creator, vAddr);
      const id3 = await createChallenge(cp, creator, vAddr);

      // Alice joins all 3
      await cp.connect(alice).joinChallengeNative(id1, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(id2, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(id3, { value: ONE_ETH });

      // Register event with 3 outcomes
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("match-m7"));
      await router.registerEvent(eventId, "Three-way Event");
      await router.addOutcome(eventId, "Outcome A", id1, creator.address);
      await router.addOutcome(eventId, "Outcome B", id2, creator.address);
      await router.addOutcome(eventId, "Outcome C", id3, creator.address);

      // Advance past proof deadline (all challenges share similar timing)
      const c1 = await cp.getChallenge(id1);
      await time.increaseTo(Number(c1.proofDeadlineTs) + 1);

      // Finalize event: winner = outcome 1 (index 1)
      await router.finalizeEvent(eventId, 1, "0x");

      // Verify winner challenge finalized
      const c2After = await cp.getChallenge(id2);
      expect(c2After.status).to.equal(1); // Finalized

      // Losing challenges (id1, id3) are still Active
      const c1Before = await cp.getChallenge(id1);
      expect(c1Before.status).to.equal(0); // Active

      const c3Before = await cp.getChallenge(id3);
      expect(c3Before.status).to.equal(0); // Active

      // Now finalize losing outcomes
      await router.finalizeLosingOutcomes(eventId);

      // Verify losing challenges are now finalized with Fail outcome
      const c1After = await cp.getChallenge(id1);
      expect(c1After.status).to.equal(1); // Finalized
      expect(c1After.outcome).to.equal(2); // Fail (no winners)

      const c3After = await cp.getChallenge(id3);
      expect(c3After.status).to.equal(1); // Finalized
      expect(c3After.outcome).to.equal(2); // Fail (no winners)
    });

    it("reverts if event not yet resolved", async function () {
      const { router } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("not-resolved"));
      await router.registerEvent(eventId, "Not Resolved");

      await expect(router.finalizeLosingOutcomes(eventId))
        .to.be.revertedWithCustomError(router, "NotFinalized");
    });

    it("reverts if event does not exist", async function () {
      const { router } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
      await expect(router.finalizeLosingOutcomes(eventId))
        .to.be.revertedWithCustomError(router, "EventMissing");
    });

    it("non-owner cannot call finalizeLosingOutcomes", async function () {
      const { router, alice } = await loadFixture(deployFixture);
      const eventId = ethers.keccak256(ethers.toUtf8Bytes("no-access"));
      await router.registerEvent(eventId, "No Access");
      await expect(router.connect(alice).finalizeLosingOutcomes(eventId))
        .to.be.revertedWithCustomError(router, "NotOwner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Ownership (2-step, SC-H4)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Ownership (2-step)", function () {
    it("transferOwnership sets pendingOwner, acceptOwnership completes transfer", async function () {
      const { router, deployer, alice } = await loadFixture(deployFixture);

      // transferOwnership only sets pendingOwner
      await router.transferOwnership(alice.address);
      expect(await router.owner()).to.equal(deployer.address); // still deployer
      expect(await router.pendingOwner()).to.equal(alice.address);

      // acceptOwnership completes the transfer
      await router.connect(alice).acceptOwnership();
      expect(await router.owner()).to.equal(alice.address);
      expect(await router.pendingOwner()).to.equal(ethers.ZeroAddress);
    });

    it("non-pending address cannot accept", async function () {
      const { router, alice, bob } = await loadFixture(deployFixture);
      await router.transferOwnership(alice.address);

      await expect(
        router.connect(bob).acceptOwnership()
      ).to.be.revertedWithCustomError(router, "NotPendingOwner");
    });

    it("reverts transfer to zero address", async function () {
      const { router } = await loadFixture(deployFixture);
      await expect(router.transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(router, "ZeroAddress");
    });

    it("emits OwnershipTransferStarted on transferOwnership", async function () {
      const { router, deployer, alice } = await loadFixture(deployFixture);
      await expect(router.transferOwnership(alice.address))
        .to.emit(router, "OwnershipTransferStarted")
        .withArgs(deployer.address, alice.address);
    });

    it("emits OwnerChanged on acceptOwnership", async function () {
      const { router, deployer, alice } = await loadFixture(deployFixture);
      await router.transferOwnership(alice.address);

      await expect(router.connect(alice).acceptOwnership())
        .to.emit(router, "OwnerChanged")
        .withArgs(deployer.address, alice.address);
    });
  });
});
