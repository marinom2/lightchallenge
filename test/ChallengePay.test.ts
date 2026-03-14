import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { Treasury, ChallengePay } from "../typechain-types";

// ─── Helpers ────────────────────────────────────────────────────────────────

const ONE_ETH = ethers.parseEther("1");
const HALF_ETH = ethers.parseEther("0.5");
const ONE_HOUR = 3600;
const ONE_DAY = 86400;

async function deployFixture() {
  const [deployer, admin, protocol, creator, alice, bob, charlie, eve] =
    await ethers.getSigners();

  // Treasury
  const TreasuryFactory = await ethers.getContractFactory("Treasury");
  const treasury = await TreasuryFactory.deploy(admin.address, ethers.ZeroAddress);
  await treasury.waitForDeployment();

  // ChallengePay
  const CPFactory = await ethers.getContractFactory("ChallengePay");
  const cp = await CPFactory.deploy(await treasury.getAddress(), protocol.address);
  await cp.waitForDeployment();

  // Transfer admin
  await cp.connect(deployer).transferAdmin(admin.address);
  await cp.connect(admin).acceptAdmin();

  // Grant OPERATOR_ROLE to ChallengePay on Treasury
  const OPERATOR_ROLE = await treasury.OPERATOR_ROLE();
  await treasury.connect(admin).grantRole(OPERATOR_ROLE, await cp.getAddress());

  // Deploy mock verifiers
  const MockV = await ethers.getContractFactory("MockVerifier");
  const mockVerifier = await MockV.deploy();
  await mockVerifier.waitForDeployment();

  const MockVF = await ethers.getContractFactory("MockVerifierFalse");
  const mockVerifierFalse = await MockVF.deploy();
  await mockVerifierFalse.waitForDeployment();

  return { deployer, admin, protocol, creator, alice, bob, charlie, eve, treasury, cp, mockVerifier, mockVerifierFalse };
}

/**
 * Build a standard CreateParams for a native-currency challenge.
 * startTs defaults to now + 1 hour, duration 1 day, proof deadline startTs + duration + 1 hour.
 */
async function defaultCreateParams(
  verifierAddr: string,
  overrides: Partial<{
    kind: number;
    currency: number;
    token: string;
    stakeAmount: bigint;
    joinClosesTs: bigint;
    startTs: bigint;
    duration: bigint;
    maxParticipants: bigint;
    proofDeadlineTs: bigint;
    externalId: string;
  }> = {}
) {
  const now = BigInt(await time.latest());
  const startTs = overrides.startTs ?? now + BigInt(ONE_HOUR);
  const duration = overrides.duration ?? BigInt(ONE_DAY);
  const endTime = startTs + duration;
  const proofDeadlineTs = overrides.proofDeadlineTs ?? endTime + BigInt(ONE_HOUR);

  return {
    kind: overrides.kind ?? 1,
    currency: overrides.currency ?? 0, // NATIVE
    token: overrides.token ?? ethers.ZeroAddress,
    stakeAmount: overrides.stakeAmount ?? ONE_ETH,
    joinClosesTs: overrides.joinClosesTs ?? 0n, // default = startTs
    startTs,
    duration,
    maxParticipants: overrides.maxParticipants ?? 0n,
    verifier: verifierAddr,
    proofDeadlineTs,
    externalId: overrides.externalId ?? ethers.ZeroHash,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("ChallengePay (Final V1)", function () {

  // ═══════════════════════════════════════════════════════════════════════════
  // Deployment
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Deployment", function () {
    it("sets treasury, protocol, admin correctly", async function () {
      const { cp, treasury, protocol, admin } = await loadFixture(deployFixture);
      expect(await cp.treasury()).to.equal(await treasury.getAddress());
      expect(await cp.protocol()).to.equal(protocol.address);
      expect(await cp.admin()).to.equal(admin.address);
    });

    it("starts with nextChallengeId = 2", async function () {
      const { cp } = await loadFixture(deployFixture);
      expect(await cp.nextChallengeId()).to.equal(2);
    });

    it("reverts on zero address constructor args", async function () {
      const CPFactory = await ethers.getContractFactory("ChallengePay");
      await expect(CPFactory.deploy(ethers.ZeroAddress, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(CPFactory, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Admin
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Admin", function () {
    it("2-step admin transfer works", async function () {
      const { cp, admin, alice } = await loadFixture(deployFixture);
      await cp.connect(admin).transferAdmin(alice.address);
      expect(await cp.admin()).to.equal(admin.address); // not transferred yet
      await cp.connect(alice).acceptAdmin();
      expect(await cp.admin()).to.equal(alice.address);
    });

    it("non-admin cannot call admin functions", async function () {
      const { cp, alice } = await loadFixture(deployFixture);
      await expect(cp.connect(alice).pauseAll(true))
        .to.be.revertedWithCustomError(cp, "NotAdmin");
    });

    it("global pause blocks operations", async function () {
      const { cp, admin, creator, mockVerifier } = await loadFixture(deployFixture);
      await cp.connect(admin).pauseAll(true);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await expect(
        cp.connect(creator).createChallenge(params, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "GlobalPausedError");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Challenge Creation
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Challenge Creation", function () {
    it("creates challenge with correct state", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const vAddr = await mockVerifier.getAddress();
      const params = await defaultCreateParams(vAddr);

      const tx = await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      const receipt = await tx.wait();

      const c = await cp.getChallenge(2);
      expect(c.id).to.equal(2);
      expect(c.kind).to.equal(1);
      expect(c.status).to.equal(0); // Active
      expect(c.outcome).to.equal(0); // None
      expect(c.creator).to.equal(creator.address);
      expect(c.stake).to.equal(ONE_ETH);
      expect(c.verifier).to.equal(vAddr);
      expect(c.participantsCount).to.equal(1); // creator
    });

    it("emits ChallengeCreated event", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());

      await expect(cp.connect(creator).createChallenge(params, { value: ONE_ETH }))
        .to.emit(cp, "ChallengeCreated");
    });

    it("deposits stake into Treasury", async function () {
      const { cp, creator, mockVerifier, treasury } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());

      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      const bucketBal = await treasury.bucketEthBalance(2);
      expect(bucketBal).to.equal(ONE_ETH);
    });

    it("zero-stake challenge works", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress(), { stakeAmount: 0n });

      await cp.connect(creator).createChallenge(params, { value: 0n });
      const c = await cp.getChallenge(2);
      expect(c.stake).to.equal(0);
      expect(c.participantsCount).to.equal(0);
    });

    it("reverts if startTs in the past", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        startTs: now - 1n,
      });

      await expect(
        cp.connect(creator).createChallenge(params, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "StartTooSoon");
    });

    it("reverts if duration is 0", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        duration: 0n,
      });

      await expect(
        cp.connect(creator).createChallenge(params, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });

    it("reverts if lead time too short", async function () {
      const { cp, admin, creator, mockVerifier } = await loadFixture(deployFixture);
      await cp.connect(admin).setLeadTimeBounds(3600, 86400 * 365); // min 1hr
      const now = BigInt(await time.latest());
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        startTs: now + 30n, // only 30 seconds
      });

      await expect(
        cp.connect(creator).createChallenge(params, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "LeadTimeOutOfBounds");
    });

    it("reverts if proof deadline before end time", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const startTs = now + BigInt(ONE_HOUR);
      const duration = BigInt(ONE_DAY);
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        startTs,
        duration,
        proofDeadlineTs: startTs + duration - 1n, // before end
      });

      await expect(
        cp.connect(creator).createChallenge(params, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "ProofDeadlineBeforeEnd");
    });

    it("reverts if wrong msg.value for native", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());

      await expect(
        cp.connect(creator).createChallenge(params, { value: HALF_ETH })
      ).to.be.revertedWithCustomError(cp, "WrongMsgValue");
    });

    it("enforces external ID uniqueness", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const extId = ethers.keccak256(ethers.toUtf8Bytes("unique1"));
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        externalId: extId,
      });

      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      const params2 = await defaultCreateParams(await mockVerifier.getAddress(), {
        externalId: extId,
      });
      await expect(
        cp.connect(creator).createChallenge(params2, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "ExternalIdAlreadyUsed");
    });

    it("creator allowlist blocks unauthorized creators", async function () {
      const { cp, admin, creator, mockVerifier } = await loadFixture(deployFixture);
      await cp.connect(admin).setUseCreatorAllowlist(true);
      const params = await defaultCreateParams(await mockVerifier.getAddress());

      await expect(
        cp.connect(creator).createChallenge(params, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "NotEligible");

      // Allow creator
      await cp.connect(admin).setCreatorAllowed(creator.address, true);
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // joinClosesTs
  // ═══════════════════════════════════════════════════════════════════════════
  describe("joinClosesTs", function () {
    it("defaults joinClosesTs to startTs when 0", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        joinClosesTs: 0n,
      });
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      expect(c.joinClosesTs).to.equal(c.startTs);
    });

    it("allows explicit joinClosesTs before startTs", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        joinClosesTs: now + BigInt(ONE_HOUR / 2), // 30 min from now
        startTs: now + BigInt(ONE_HOUR),
      });
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      expect(c.joinClosesTs).to.be.lt(c.startTs);
    });

    it("reverts if joinClosesTs > startTs", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const startTs = now + BigInt(ONE_HOUR);
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        joinClosesTs: startTs + 1n,
        startTs,
      });
      await expect(
        cp.connect(creator).createChallenge(params, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "JoinClosesAfterStart");
    });

    it("blocks joining after joinClosesTs", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const now = BigInt(await time.latest());
      const joinClose = now + BigInt(ONE_HOUR / 2);
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        joinClosesTs: joinClose,
        startTs: now + BigInt(ONE_HOUR),
      });
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      // Advance past joinClosesTs
      await time.increaseTo(Number(joinClose) + 1);

      await expect(
        cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "JoinWindowClosed");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Joining
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Joining", function () {
    it("join native deposits into Treasury and updates pool", async function () {
      const { cp, creator, alice, mockVerifier, treasury } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await cp.connect(alice).joinChallengeNative(2, { value: HALF_ETH });

      const c = await cp.getChallenge(2);
      expect(c.pool).to.equal(ONE_ETH + HALF_ETH);
      expect(c.participantsCount).to.equal(2);

      const contrib = await cp.contribOf(2, alice.address);
      expect(contrib).to.equal(HALF_ETH);
    });

    it("same user can join multiple times (adds to contribution)", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await cp.connect(alice).joinChallengeNative(2, { value: HALF_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: HALF_ETH });

      const contrib = await cp.contribOf(2, alice.address);
      expect(contrib).to.equal(ONE_ETH);
      const c = await cp.getChallenge(2);
      expect(c.participantsCount).to.equal(2); // still 2 unique
    });

    it("reverts joining with 0 value", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await expect(
        cp.connect(alice).joinChallengeNative(2, { value: 0 })
      ).to.be.revertedWithCustomError(cp, "AmountZero");
    });

    it("enforces participant cap", async function () {
      const { cp, creator, alice, bob, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        maxParticipants: 2n,
      });
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await cp.connect(alice).joinChallengeNative(2, { value: HALF_ETH });
      // creator + alice = 2 participants (cap reached)

      await expect(
        cp.connect(bob).joinChallengeNative(2, { value: HALF_ETH })
      ).to.be.revertedWithCustomError(cp, "MaxParticipantsReached");
    });

    it("reverts if challenge is paused", async function () {
      const { cp, admin, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(admin).pauseChallenge(2, true);

      await expect(
        cp.connect(alice).joinChallengeNative(2, { value: HALF_ETH })
      ).to.be.revertedWithCustomError(cp, "ChallengePaused");
    });

    it("reverts joining after start time", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs));

      await expect(
        cp.connect(alice).joinChallengeNative(2, { value: HALF_ETH })
      ).to.be.revertedWithCustomError(cp, "JoinWindowClosed");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Proof Submission
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Proof Submission", function () {
    async function setupWithJoin() {
      const f = await loadFixture(deployFixture);
      const { cp, creator, alice, mockVerifier } = f;
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
      return f;
    }

    it("marks winner on valid proof", async function () {
      const { cp, creator, alice, mockVerifier } = await setupWithJoin();
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await cp.connect(alice).submitMyProof(2, "0x");
      expect(await cp.isWinner(2, alice.address)).to.be.true;
    });

    it("emits WinnerMarked", async function () {
      const { cp, alice } = await setupWithJoin();
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await expect(cp.connect(alice).submitMyProof(2, "0x"))
        .to.emit(cp, "WinnerMarked");
    });

    it("does NOT revert on false proof (just doesn't mark winner)", async function () {
      const { cp, creator, alice, mockVerifierFalse } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifierFalse.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await cp.connect(alice).submitMyProof(2, "0x");
      expect(await cp.isWinner(2, alice.address)).to.be.false;
    });

    it("reverts on double winner", async function () {
      const { cp, alice } = await setupWithJoin();
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await cp.connect(alice).submitMyProof(2, "0x");
      await expect(
        cp.connect(alice).submitMyProof(2, "0x")
      ).to.be.revertedWithCustomError(cp, "AlreadyWinner");
    });

    it("reverts if proof before startTs", async function () {
      const { cp, alice } = await setupWithJoin();
      await expect(
        cp.connect(alice).submitMyProof(2, "0x")
      ).to.be.revertedWithCustomError(cp, "ProofNotOpen");
    });

    it("reverts if proof after deadline", async function () {
      const { cp, alice } = await setupWithJoin();
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);

      await expect(
        cp.connect(alice).submitMyProof(2, "0x")
      ).to.be.revertedWithCustomError(cp, "ProofWindowClosed");
    });

    it("submitProofFor works for third-party submission", async function () {
      const { cp, admin, alice, bob } = await setupWithJoin();
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      // Register bob as dispatcher (SC-H1 access control)
      await cp.connect(admin).setDispatcher(bob.address, true);

      // Bob submits proof on behalf of alice
      await cp.connect(bob).submitProofFor(2, alice.address, "0x");
      expect(await cp.isWinner(2, alice.address)).to.be.true;
    });

    it("submitProofForBatch works", async function () {
      const { cp, admin, creator, alice, bob, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
      await cp.connect(bob).joinChallengeNative(2, { value: ONE_ETH });

      // Register creator as dispatcher (SC-H1 access control)
      await cp.connect(admin).setDispatcher(creator.address, true);

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await cp.connect(creator).submitProofForBatch(
        2,
        [alice.address, bob.address],
        ["0x", "0x"]
      );

      expect(await cp.isWinner(2, alice.address)).to.be.true;
      expect(await cp.isWinner(2, bob.address)).to.be.true;
    });

    it("reverts if participant has no contribution", async function () {
      const { cp, creator, bob, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await expect(
        cp.connect(bob).submitMyProof(2, "0x")
      ).to.be.revertedWithCustomError(cp, "NotEligible");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Finalize — Success
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Finalize (Success)", function () {
    async function setupFinalizableSuccess() {
      const f = await loadFixture(deployFixture);
      const { cp, admin, creator, alice, bob, mockVerifier } = f;

      // Set fees: 10% forfeit fee (5% protocol, 5% creator), 10% cashback
      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000,
        protocolBps: 500,
        creatorBps: 500,
        cashbackBps: 1000,
      });

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
      await cp.connect(bob).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);

      // Advance to proof window
      await time.increaseTo(Number(c.startTs) + 1);

      // Only creator wins
      await cp.connect(creator).submitMyProof(2, "0x");

      // Advance past proof deadline
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);

      return f;
    }

    it("finalizes with success outcome when winners exist", async function () {
      const { cp } = await setupFinalizableSuccess();
      await cp.finalize(2);

      const c = await cp.getChallenge(2);
      expect(c.status).to.equal(1); // Finalized
      expect(c.outcome).to.equal(1); // Success
    });

    it("creates snapshot with correct math", async function () {
      const { cp } = await setupFinalizableSuccess();
      await cp.finalize(2);

      const s = await cp.getSnapshot(2);
      expect(s.set).to.be.true;
      expect(s.success).to.be.true;
      expect(s.committedPool).to.equal(ONE_ETH); // creator's 1 ETH
      expect(s.forfeitedPool).to.equal(ONE_ETH * 2n); // alice + bob = 2 ETH
    });

    it("emits Finalized event", async function () {
      const { cp } = await setupFinalizableSuccess();
      await expect(cp.finalize(2)).to.emit(cp, "Finalized");
    });

    it("reverts if finalized before end time", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      await expect(cp.finalize(2)).to.be.revertedWithCustomError(cp, "BeforeDeadline");
    });

    it("reverts on double finalize", async function () {
      const { cp } = await setupFinalizableSuccess();
      await cp.finalize(2);
      await expect(cp.finalize(2)).to.be.revertedWithCustomError(cp, "AlreadyFinalized");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Finalize — Fail
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Finalize (Fail)", function () {
    it("finalizes with fail outcome when no winners", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);

      await cp.finalize(2);

      const final_ = await cp.getChallenge(2);
      expect(final_.status).to.equal(1); // Finalized
      expect(final_.outcome).to.equal(2); // Fail
    });

    it("no-winner distributable goes to protocol", async function () {
      const { cp, admin, creator, alice, mockVerifier, treasury, protocol } = await loadFixture(deployFixture);
      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000,
        protocolBps: 500,
        creatorBps: 500,
        cashbackBps: 0,
      });

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);

      await cp.finalize(2);

      // Protocol should have allowance for: protocolAmt + distributable
      // Pool=2ETH, losers=2ETH, fee=10%=0.2ETH, distributable=1.8ETH
      // protocol gets 0.1ETH (protocolBps) + dust + 1.8ETH (distributable, no winners)
      const allowance = await treasury.ethAllowanceOf(2, protocol.address);
      expect(allowance).to.be.gt(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cancel / Refund
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Cancel / Refund", function () {
    it("creator can cancel", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await cp.connect(creator).cancelChallenge(2);
      const c = await cp.getChallenge(2);
      expect(c.status).to.equal(2); // Canceled
      expect(c.canceled).to.be.true;
    });

    it("admin can cancel", async function () {
      const { cp, admin, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await cp.connect(admin).cancelChallenge(2);
      const c = await cp.getChallenge(2);
      expect(c.status).to.equal(2);
    });

    it("non-creator non-admin cannot cancel", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await expect(
        cp.connect(alice).cancelChallenge(2)
      ).to.be.revertedWithCustomError(cp, "NotCreatorOrAdmin");
    });

    it("cannot cancel twice", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(creator).cancelChallenge(2);

      await expect(
        cp.connect(creator).cancelChallenge(2)
      ).to.be.revertedWithCustomError(cp, "AlreadyCanceled");
    });

    it("claimRefund returns full contribution", async function () {
      const { cp, creator, alice, mockVerifier, treasury } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: HALF_ETH });

      await cp.connect(creator).cancelChallenge(2);

      await cp.connect(creator).claimRefund(2);
      const creatorAllowance = await treasury.ethAllowanceOf(2, creator.address);
      expect(creatorAllowance).to.equal(ONE_ETH);

      await cp.connect(alice).claimRefund(2);
      const aliceAllowance = await treasury.ethAllowanceOf(2, alice.address);
      expect(aliceAllowance).to.equal(HALF_ETH);
    });

    it("cannot claimRefund if not canceled", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await expect(
        cp.connect(creator).claimRefund(2)
      ).to.be.revertedWithCustomError(cp, "ChallengeNotFinalized");
    });

    it("cannot double-claimRefund", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(creator).cancelChallenge(2);

      await cp.connect(creator).claimRefund(2);
      await expect(
        cp.connect(creator).claimRefund(2)
      ).to.be.revertedWithCustomError(cp, "NotEligible");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Claims — Winner
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Claims — Winner", function () {
    async function setupFinalizedSuccess() {
      const f = await loadFixture(deployFixture);
      const { cp, admin, creator, alice, bob, mockVerifier } = f;

      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000, // 10%
        protocolBps: 500,    // 5%
        creatorBps: 500,     // 5%
        cashbackBps: 1000,   // 10%
      });

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
      await cp.connect(bob).joinChallengeNative(2, { value: ONE_ETH });

      // Only creator wins
      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);
      await cp.connect(creator).submitMyProof(2, "0x");
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(2);

      return f;
    }

    it("winner can claim principal + bonus", async function () {
      const { cp, creator, treasury } = await setupFinalizedSuccess();

      await cp.connect(creator).claimWinner(2);

      const allowance = await treasury.ethAllowanceOf(2, creator.address);
      // Winner contributed 1 ETH. Losers contributed 2 ETH.
      // Cashback = 10% of 2 ETH = 0.2 ETH
      // losersAfterCashback = 1.8 ETH
      // feeGross = 10% of 1.8 = 0.18 ETH
      // protocolAmt = 5% of 1.8 = 0.09, creatorAmt = 5% of 1.8 = 0.09
      // distributable = 1.8 - 0.18 = 1.62 ETH
      // claimWinner grants: 1 + 1*1.62 = 2.62 ETH
      // creatorAmt also grants 0.09 ETH to creator (same address)
      // Total allowance = 2.62 + 0.09 = 2.71 ETH
      expect(allowance).to.equal(ethers.parseEther("2.71"));
    });

    it("cannot double-claim winner", async function () {
      const { cp, creator } = await setupFinalizedSuccess();
      await cp.connect(creator).claimWinner(2);
      await expect(
        cp.connect(creator).claimWinner(2)
      ).to.be.revertedWithCustomError(cp, "NotEligible");
    });

    it("non-winner cannot claim winner", async function () {
      const { cp, alice } = await setupFinalizedSuccess();
      await expect(
        cp.connect(alice).claimWinner(2)
      ).to.be.revertedWithCustomError(cp, "NotEligible");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Claims — Loser (Cashback)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Claims — Loser", function () {
    async function setupFinalizedWithCashback() {
      const f = await loadFixture(deployFixture);
      const { cp, admin, creator, alice, bob, mockVerifier } = f;

      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000,
        protocolBps: 500,
        creatorBps: 500,
        cashbackBps: 1000, // 10%
      });

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
      await cp.connect(bob).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);
      await cp.connect(creator).submitMyProof(2, "0x"); // only creator wins
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(2);

      return f;
    }

    it("loser can claim cashback", async function () {
      const { cp, alice, treasury } = await setupFinalizedWithCashback();

      await cp.connect(alice).claimLoser(2);

      // Alice contributed 1 ETH. Total losers pool = 2 ETH.
      // Cashback = 10% of 2 ETH = 0.2 ETH
      // perCashbackX = 0.2e18 / 2e18 = 0.1e18
      // Alice gets: 1 * 0.1 = 0.1 ETH
      const allowance = await treasury.ethAllowanceOf(2, alice.address);
      expect(allowance).to.equal(ethers.parseEther("0.1"));
    });

    it("cannot double-claim loser", async function () {
      const { cp, alice } = await setupFinalizedWithCashback();
      await cp.connect(alice).claimLoser(2);
      await expect(
        cp.connect(alice).claimLoser(2)
      ).to.be.revertedWithCustomError(cp, "NotEligible");
    });

    it("winner cannot claim loser cashback", async function () {
      const { cp, creator } = await setupFinalizedWithCashback();
      await expect(
        cp.connect(creator).claimLoser(2)
      ).to.be.revertedWithCustomError(cp, "NotEligible");
    });

    it("no cashback if cashbackBps is 0", async function () {
      const { cp, admin, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000,
        protocolBps: 500,
        creatorBps: 500,
        cashbackBps: 0,
      });

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);
      await cp.connect(creator).submitMyProof(2, "0x");
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(2);

      await expect(
        cp.connect(alice).claimLoser(2)
      ).to.be.revertedWithCustomError(cp, "NotEligible");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Fee Snapshotting
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Fee Snapshotting", function () {
    it("uses creation-time fees, not current fees", async function () {
      const { cp, admin, creator, alice, bob, mockVerifier, treasury, protocol } =
        await loadFixture(deployFixture);

      // Set 10% fee at creation time
      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000,
        protocolBps: 1000,
        creatorBps: 0,
        cashbackBps: 0,
      });

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      // Change fees AFTER creation
      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 5000,  // 50%!
        protocolBps: 5000,
        creatorBps: 0,
        cashbackBps: 0,
      });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);
      await cp.connect(creator).submitMyProof(2, "0x");
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(2);

      // Protocol should get 10% of losers (1 ETH), not 50%
      const s = await cp.getSnapshot(2);
      expect(s.protocolAmt).to.equal(ethers.parseEther("0.1"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Verification Config
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Verification Config", function () {
    it("admin can update verifier (before participants)", async function () {
      const { cp, admin, creator, mockVerifier, mockVerifierFalse } = await loadFixture(deployFixture);
      // Create with 0 stake so no participants yet
      const params = await defaultCreateParams(await mockVerifier.getAddress(), { stakeAmount: 0n });
      await cp.connect(creator).createChallenge(params, { value: 0n });

      await cp.connect(admin).setVerificationConfig(
        2,
        await mockVerifierFalse.getAddress(),
        0
      );

      const c = await cp.getChallenge(2);
      expect(c.verifier).to.equal(await mockVerifierFalse.getAddress());
    });

    it("tighten-only prevents extending proof deadline", async function () {
      const { cp, admin, creator, mockVerifier } = await loadFixture(deployFixture);
      await cp.connect(admin).setProofTightenOnly(true);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      const c = await cp.getChallenge(2);

      await expect(
        cp.connect(admin).setVerificationConfig(2, ethers.ZeroAddress, c.proofDeadlineTs + 1n)
      ).to.be.revertedWithCustomError(cp, "TightenOnlyViolation");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Pause behavior
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Pause", function () {
    it("per-challenge pause blocks proof submission", async function () {
      const { cp, admin, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);
      await cp.connect(admin).pauseChallenge(2, true);

      await expect(
        cp.connect(alice).submitMyProof(2, "0x")
      ).to.be.revertedWithCustomError(cp, "ChallengePaused");
    });

    it("unpausing restores operations", async function () {
      const { cp, admin, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await cp.connect(admin).pauseChallenge(2, true);
      await cp.connect(admin).pauseChallenge(2, false);

      await cp.connect(alice).submitMyProof(2, "0x");
      expect(await cp.isWinner(2, alice.address)).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Edge Cases", function () {
    it("everyone wins: no forfeit, losers pool = 0", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await cp.connect(creator).submitMyProof(2, "0x");
      await cp.connect(alice).submitMyProof(2, "0x");

      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(2);

      const s = await cp.getSnapshot(2);
      expect(s.forfeitedPool).to.equal(0);
      expect(s.perCommittedBonusX).to.equal(0);

      // Each winner gets just their principal back
      await cp.connect(creator).claimWinner(2);
      await cp.connect(alice).claimWinner(2);
    });

    it("nobody wins: all forfeited, protocol gets distributable", async function () {
      const { cp, admin, creator, alice, mockVerifier, treasury, protocol } =
        await loadFixture(deployFixture);

      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000,
        protocolBps: 1000,
        creatorBps: 0,
        cashbackBps: 0,
      });

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(2);

      // Total = 2 ETH, all losers. fee=10%=0.2ETH (all protocol). distributable=1.8ETH → protocol
      // Protocol gets 0.2 + 1.8 = 2.0 ETH
      const allowance = await treasury.ethAllowanceOf(2, protocol.address);
      expect(allowance).to.equal(ethers.parseEther("2"));
    });

    it("solo challenge: creator is only participant, wins", async function () {
      const { cp, creator, mockVerifier, treasury } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);
      await cp.connect(creator).submitMyProof(2, "0x");
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(2);

      await cp.connect(creator).claimWinner(2);
      const allowance = await treasury.ethAllowanceOf(2, creator.address);
      expect(allowance).to.equal(ONE_ETH); // just gets principal back
    });

    it("cannot join canceled challenge", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(creator).cancelChallenge(2);

      await expect(
        cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH })
      ).to.be.revertedWithCustomError(cp, "ChallengePaused");
    });

    it("cannot finalize canceled challenge", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.connect(creator).cancelChallenge(2);

      await expect(cp.finalize(2)).to.be.revertedWithCustomError(cp, "NotActive");
    });

    it("multiple challenges are isolated", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params1 = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params1, { value: ONE_ETH });

      const params2 = await defaultCreateParams(await mockVerifier.getAddress(), { stakeAmount: HALF_ETH });
      await cp.connect(alice).createChallenge(params2, { value: HALF_ETH });

      const c1 = await cp.getChallenge(2);
      const c2 = await cp.getChallenge(3);
      expect(c1.pool).to.equal(ONE_ETH);
      expect(c2.pool).to.equal(HALF_ETH);
      expect(c1.creator).to.equal(creator.address);
      expect(c2.creator).to.equal(alice.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Treasury Integration
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Treasury Integration", function () {
    it("Treasury bucket balances match pool amounts", async function () {
      const { cp, creator, alice, bob, mockVerifier, treasury } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
      await cp.connect(bob).joinChallengeNative(2, { value: HALF_ETH });

      const bucket = await treasury.bucketEthBalance(2);
      expect(bucket).to.equal(ONE_ETH + ONE_ETH + HALF_ETH);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SC-C1: Fee Config Validation
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Fee Config Validation (SC-C1)", function () {
    it("reverts on forfeitFeeBps > 10000", async function () {
      const { cp, admin } = await loadFixture(deployFixture);
      await expect(
        cp.connect(admin).setFeeConfig({
          forfeitFeeBps: 10001,
          protocolBps: 0,
          creatorBps: 0,
          cashbackBps: 0,
        })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });

    it("reverts on cashbackBps > 10000", async function () {
      const { cp, admin } = await loadFixture(deployFixture);
      await expect(
        cp.connect(admin).setFeeConfig({
          forfeitFeeBps: 1000,
          protocolBps: 500,
          creatorBps: 500,
          cashbackBps: 10001,
        })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });

    it("reverts on protocolBps + creatorBps > forfeitFeeBps", async function () {
      const { cp, admin } = await loadFixture(deployFixture);
      await expect(
        cp.connect(admin).setFeeConfig({
          forfeitFeeBps: 1000,
          protocolBps: 600,
          creatorBps: 500,
          cashbackBps: 0,
        })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });

    it("reverts when exceeding feeCaps", async function () {
      const { cp, admin } = await loadFixture(deployFixture);
      // Set caps first
      await cp.connect(admin).setFeeCaps({
        forfeitFeeMaxBps: 2000,
        cashbackMaxBps: 500,
      });
      // Exceed forfeit cap
      await expect(
        cp.connect(admin).setFeeConfig({
          forfeitFeeBps: 2001,
          protocolBps: 1000,
          creatorBps: 1000,
          cashbackBps: 0,
        })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
      // Exceed cashback cap
      await expect(
        cp.connect(admin).setFeeConfig({
          forfeitFeeBps: 2000,
          protocolBps: 1000,
          creatorBps: 1000,
          cashbackBps: 501,
        })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });

    it("allows valid config", async function () {
      const { cp, admin } = await loadFixture(deployFixture);
      await cp.connect(admin).setFeeCaps({
        forfeitFeeMaxBps: 5000,
        cashbackMaxBps: 3000,
      });
      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 3000,
        protocolBps: 1500,
        creatorBps: 1500,
        cashbackBps: 2000,
      });
      const fc = await cp.feeConfig();
      expect(fc.forfeitFeeBps).to.equal(3000);
      expect(fc.protocolBps).to.equal(1500);
      expect(fc.creatorBps).to.equal(1500);
      expect(fc.cashbackBps).to.equal(2000);
    });

    it("setFeeCaps reverts on caps > 10000", async function () {
      const { cp, admin } = await loadFixture(deployFixture);
      await expect(
        cp.connect(admin).setFeeCaps({
          forfeitFeeMaxBps: 10001,
          cashbackMaxBps: 0,
        })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
      await expect(
        cp.connect(admin).setFeeCaps({
          forfeitFeeMaxBps: 0,
          cashbackMaxBps: 10001,
        })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SC-H1: Dispatcher Role
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Dispatcher Role (SC-H1)", function () {
    it("submitProofFor reverts for non-dispatchers", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      // Eve (not dispatcher, not admin) tries to submitProofFor
      await expect(
        cp.connect(creator).submitProofFor(2, alice.address, "0x")
      ).to.be.revertedWithCustomError(cp, "NotAdmin");
    });

    it("works for dispatchers after setDispatcher", async function () {
      const { cp, admin, creator, alice, bob, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      // Grant bob as dispatcher
      await cp.connect(admin).setDispatcher(bob.address, true);

      // Now bob can submit proof for alice
      await cp.connect(bob).submitProofFor(2, alice.address, "0x");
      expect(await cp.isWinner(2, alice.address)).to.be.true;
    });

    it("works for admin", async function () {
      const { cp, admin, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      // Admin can always submitProofFor
      await cp.connect(admin).submitProofFor(2, alice.address, "0x");
      expect(await cp.isWinner(2, alice.address)).to.be.true;
    });

    it("setDispatcher reverts for non-admin", async function () {
      const { cp, alice } = await loadFixture(deployFixture);
      await expect(
        cp.connect(alice).setDispatcher(alice.address, true)
      ).to.be.revertedWithCustomError(cp, "NotAdmin");
    });

    it("submitProofForBatch also requires dispatcher", async function () {
      const { cp, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      await expect(
        cp.connect(creator).submitProofForBatch(2, [alice.address], ["0x"])
      ).to.be.revertedWithCustomError(cp, "NotAdmin");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SC-M1: Cancel after winners guard
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Cancel after winners guard (SC-M1)", function () {
    it("cancelChallenge reverts after winners exist", async function () {
      const { cp, admin, creator, alice, mockVerifier } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });

      const c = await cp.getChallenge(2);
      await time.increaseTo(Number(c.startTs) + 1);

      // Submit proof — creator becomes winner (via dispatcher/admin)
      await cp.connect(admin).setDispatcher(admin.address, true);
      await cp.connect(admin).submitProofFor(2, creator.address, "0x");

      // Now try to cancel — should revert
      await expect(
        cp.connect(creator).cancelChallenge(2)
      ).to.be.revertedWithCustomError(cp, "AlreadyFinalized");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SC-M2: Verifier immutability after join
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Verifier immutability after join (SC-M2)", function () {
    it("setVerificationConfig reverts verifier change after participants join", async function () {
      const { cp, admin, creator, alice, mockVerifier, mockVerifierFalse } = await loadFixture(deployFixture);
      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      // Creator is already a participant (contributed stake)

      await expect(
        cp.connect(admin).setVerificationConfig(
          2,
          await mockVerifierFalse.getAddress(),
          0
        )
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });

    it("allows verifier change before any participants", async function () {
      const { cp, admin, creator, mockVerifier, mockVerifierFalse } = await loadFixture(deployFixture);
      // Create challenge with 0 stake (no participant yet)
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        stakeAmount: 0n,
      });
      await cp.connect(creator).createChallenge(params, { value: 0n });

      await cp.connect(admin).setVerificationConfig(
        2,
        await mockVerifierFalse.getAddress(),
        0
      );

      const c = await cp.getChallenge(2);
      expect(c.verifier).to.equal(await mockVerifierFalse.getAddress());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SC-H5: MinStake
  // ═══════════════════════════════════════════════════════════════════════════
  describe("MinStake (SC-H5)", function () {
    it("createChallenge reverts below minStake", async function () {
      const { cp, admin, creator, mockVerifier } = await loadFixture(deployFixture);
      await cp.connect(admin).setMinStake(ONE_ETH);

      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        stakeAmount: HALF_ETH,
      });
      await expect(
        cp.connect(creator).createChallenge(params, { value: HALF_ETH })
      ).to.be.revertedWithCustomError(cp, "InvalidBounds");
    });

    it("allows when minStake=0", async function () {
      const { cp, creator, mockVerifier } = await loadFixture(deployFixture);
      // minStake is 0 by default
      const params = await defaultCreateParams(await mockVerifier.getAddress(), {
        stakeAmount: HALF_ETH,
      });
      await cp.connect(creator).createChallenge(params, { value: HALF_ETH });
      const c = await cp.getChallenge(2);
      expect(c.pool).to.equal(HALF_ETH);
    });

    it("allows when msg.value >= minStake", async function () {
      const { cp, admin, creator, mockVerifier } = await loadFixture(deployFixture);
      await cp.connect(admin).setMinStake(HALF_ETH);

      const params = await defaultCreateParams(await mockVerifier.getAddress());
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      const c = await cp.getChallenge(2);
      expect(c.pool).to.equal(ONE_ETH);
    });

    it("setMinStake reverts for non-admin", async function () {
      const { cp, alice } = await loadFixture(deployFixture);
      await expect(
        cp.connect(alice).setMinStake(ONE_ETH)
      ).to.be.revertedWithCustomError(cp, "NotAdmin");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SC-M8: Rounding dust in per-winner bonus distribution
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Rounding dust (SC-M8)", function () {
    it("total claimed <= total pool; residual dust < participantsCount", async function () {
      const { cp, admin, treasury, protocol, creator, alice, bob, mockVerifier } =
        await loadFixture(deployFixture);

      const vAddr = await mockVerifier.getAddress();

      // Set fee config: 10% forfeit fee, 5% protocol, 5% creator, 0% cashback
      await cp.connect(admin).setFeeConfig({
        forfeitFeeBps: 1000,
        protocolBps: 500,
        creatorBps: 500,
        cashbackBps: 0,
      });

      // Create challenge with odd stake amount to provoke rounding
      const oddStake = ethers.parseEther("1") + 1n; // 1.000000000000000001 ETH
      const params = await defaultCreateParams(vAddr, { stakeAmount: oddStake });
      await cp.connect(creator).createChallenge(params, { value: oddStake });
      const challengeId = 2n;

      // Alice and bob join with same odd amounts
      await cp.connect(alice).joinChallengeNative(challengeId, { value: oddStake });
      await cp.connect(bob).joinChallengeNative(challengeId, { value: oddStake });

      const totalPool = oddStake * 3n;

      // Advance to proof window
      const c = await cp.getChallenge(challengeId);
      await time.increaseTo(Number(c.startTs) + 1);

      // creator and alice submit proofs (2 winners), bob is loser
      await cp.connect(creator).submitMyProof(challengeId, "0x");
      await cp.connect(alice).submitMyProof(challengeId, "0x");

      // Advance past proof deadline and finalize
      await time.increaseTo(Number(c.proofDeadlineTs) + 1);
      await cp.finalize(challengeId);

      // Read snapshot
      const snap = await cp.getSnapshot(challengeId);
      expect(snap.set).to.be.true;
      expect(snap.success).to.be.true;

      // Both winners claim their payouts (this triggers _grantFromBucket)
      await cp.connect(creator).claimWinner(challengeId);
      await cp.connect(alice).claimWinner(challengeId);

      // After all claims, read allowances remaining (should be zero since
      // claimWinner grants then the user claims from Treasury separately,
      // but here claimWinner calls _grantFromBucket which only creates the grant).
      // The key metric: bucket balance remaining after all grants.
      const bucketRemaining = await treasury.bucketEthBalance(challengeId);

      // Residual dust from integer division should be < participantsCount (3)
      // This is the per-winner bonus truncation dust.
      expect(bucketRemaining).to.be.lt(3n);

      // Also verify no overflow: total outstanding allowances for this bucket
      // should not exceed totalPool. Read all outstanding allowances.
      const creatorAllowance = await treasury.ethAllowanceOf(challengeId, creator.address);
      const aliceAllowance = await treasury.ethAllowanceOf(challengeId, alice.address);
      const protocolAllowance = await treasury.ethAllowanceOf(challengeId, protocol.address);
      const totalOutstanding = creatorAllowance + aliceAllowance + protocolAllowance;

      // totalOutstanding + bucketRemaining should equal totalPool (conservation)
      // with dust being the difference
      expect(totalOutstanding + bucketRemaining).to.be.lte(totalPool);
    });
  });
});
