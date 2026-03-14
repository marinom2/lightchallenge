import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  Treasury,
  ChallengePay,
  ChallengeAchievement,
} from "../typechain-types";

// ─── Constants ──────────────────────────────────────────────────────────────

const ONE_ETH = ethers.parseEther("1");
const ONE_HOUR = 3600;
const ONE_DAY = 86400;

const Completion = 0;
const Victory = 1;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function defaultCreateParams(verifierAddr: string) {
  const now = BigInt(await time.latest());
  const startTs = now + BigInt(ONE_HOUR);
  const duration = BigInt(ONE_DAY);
  const endTime = startTs + duration;
  const proofDeadlineTs = endTime + BigInt(ONE_HOUR);

  return {
    kind: 1,
    currency: 0,
    token: ethers.ZeroAddress,
    stakeAmount: ONE_ETH,
    joinClosesTs: 0n,
    startTs,
    duration,
    maxParticipants: 0n,
    verifier: verifierAddr,
    proofDeadlineTs,
    externalId: ethers.ZeroHash,
  };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

async function deployFixture() {
  const [deployer, admin, protocol, creator, alice, bob, charlie, eve] =
    await ethers.getSigners();

  // Treasury
  const TreasuryFactory = await ethers.getContractFactory("Treasury");
  const treasury = await TreasuryFactory.deploy(
    admin.address,
    ethers.ZeroAddress
  );
  await treasury.waitForDeployment();

  // ChallengePay
  const CPFactory = await ethers.getContractFactory("ChallengePay");
  const cp = await CPFactory.deploy(
    await treasury.getAddress(),
    protocol.address
  );
  await cp.waitForDeployment();

  // 2-step admin transfer
  await cp.connect(deployer).transferAdmin(admin.address);
  await cp.connect(admin).acceptAdmin();

  // Grant OPERATOR_ROLE
  const OPERATOR_ROLE = await treasury.OPERATOR_ROLE();
  await treasury
    .connect(admin)
    .grantRole(OPERATOR_ROLE, await cp.getAddress());

  // Mock verifier (always true)
  const MockV = await ethers.getContractFactory("MockVerifier");
  const mockVerifier = await MockV.deploy();
  await mockVerifier.waitForDeployment();

  // ChallengeAchievement
  const AchFactory = await ethers.getContractFactory("ChallengeAchievement");
  const ach = await AchFactory.deploy(
    await cp.getAddress(),
    admin.address,
    "https://app.lightchallenge.ai/api/achievements/"
  );
  await ach.waitForDeployment();

  return {
    deployer,
    admin,
    protocol,
    creator,
    alice,
    bob,
    charlie,
    eve,
    treasury,
    cp,
    mockVerifier,
    ach,
  };
}

/**
 * Creates a challenge, has alice+bob join, creator submits proof (wins),
 * and finalizes. Returns all signers + contracts.
 */
async function finalizedChallengeFixture() {
  const f = await loadFixture(deployFixture);
  const { cp, admin, creator, alice, bob, mockVerifier } = f;

  // Create challenge
  const params = await defaultCreateParams(
    await mockVerifier.getAddress()
  );
  await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

  // alice and bob join
  await cp.connect(alice).joinChallengeNative(2, { value: ONE_ETH });
  await cp.connect(bob).joinChallengeNative(2, { value: ONE_ETH });

  const c = await cp.getChallenge(2);

  // Advance to proof window, creator submits proof (wins)
  await time.increaseTo(Number(c.startTs) + 1);
  await cp.connect(creator).submitMyProof(2, "0x");

  // Advance past proof deadline
  await time.increaseTo(Number(c.proofDeadlineTs) + 1);

  // Finalize
  await cp.finalize(2);

  return f;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("ChallengeAchievement", function () {
  // ═══════════════════════════════════════════════════════════════════════════
  // Deployment
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Deployment", function () {
    it("sets challengePay, admin, and baseTokenURI", async function () {
      const { ach, cp, admin } = await loadFixture(deployFixture);
      expect(await ach.challengePay()).to.equal(await cp.getAddress());
      expect(await ach.admin()).to.equal(admin.address);
      expect(await ach.baseTokenURI()).to.equal(
        "https://app.lightchallenge.ai/api/achievements/"
      );
    });

    it("starts with nextTokenId = 1", async function () {
      const { ach } = await loadFixture(deployFixture);
      expect(await ach.nextTokenId()).to.equal(1);
    });

    it("name and symbol are correct", async function () {
      const { ach } = await loadFixture(deployFixture);
      expect(await ach.name()).to.equal("LightChallenge Achievement");
      expect(await ach.symbol()).to.equal("LACH");
    });

    it("reverts on zero challengePay address", async function () {
      const AchFactory =
        await ethers.getContractFactory("ChallengeAchievement");
      const [, admin] = await ethers.getSigners();
      await expect(
        AchFactory.deploy(ethers.ZeroAddress, admin.address, "")
      ).to.be.revertedWithCustomError(AchFactory, "ZeroAddress");
    });

    it("reverts on zero admin address", async function () {
      const AchFactory =
        await ethers.getContractFactory("ChallengeAchievement");
      const [deployer] = await ethers.getSigners();
      await expect(
        AchFactory.deploy(deployer.address, ethers.ZeroAddress, "")
      ).to.be.revertedWithCustomError(AchFactory, "ZeroAddress");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // claimCompletion — happy path
  // ═══════════════════════════════════════════════════════════════════════════
  describe("claimCompletion", function () {
    it("mints a Completion token for a participant", async function () {
      const { ach, creator } = await finalizedChallengeFixture();
      const tx = await ach.connect(creator).claimCompletion(2);

      expect(await ach.ownerOf(1)).to.equal(creator.address);
      expect(await ach.nextTokenId()).to.equal(2);

      const a = await ach.achievementOf(1);
      expect(a.challengeId).to.equal(2);
      expect(a.recipient).to.equal(creator.address);
      expect(a.aType).to.equal(Completion);
      expect(a.mintedAt).to.be.greaterThan(0);
    });

    it("emits AchievementMinted and Locked events", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      await expect(ach.connect(alice).claimCompletion(2))
        .to.emit(ach, "AchievementMinted")
        .withArgs(1, 2, alice.address, Completion)
        .and.to.emit(ach, "Locked")
        .withArgs(1);
    });

    it("allows different participants to claim for same challenge", async function () {
      const { ach, creator, alice, bob } =
        await finalizedChallengeFixture();
      await ach.connect(creator).claimCompletion(2);
      await ach.connect(alice).claimCompletion(2);
      await ach.connect(bob).claimCompletion(2);

      expect(await ach.ownerOf(1)).to.equal(creator.address);
      expect(await ach.ownerOf(2)).to.equal(alice.address);
      expect(await ach.ownerOf(3)).to.equal(bob.address);
      expect(await ach.nextTokenId()).to.equal(4);
    });

    it("sets hasMinted correctly", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      expect(await ach.hasMinted(2, alice.address, Completion)).to.be.false;
      await ach.connect(alice).claimCompletion(2);
      expect(await ach.hasMinted(2, alice.address, Completion)).to.be.true;
    });

    it("returns the minted tokenId", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      const tokenId = await ach
        .connect(alice)
        .claimCompletion.staticCall(2);
      expect(tokenId).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // claimVictory — happy path
  // ═══════════════════════════════════════════════════════════════════════════
  describe("claimVictory", function () {
    it("mints a Victory token for a winner", async function () {
      const { ach, creator } = await finalizedChallengeFixture();
      await ach.connect(creator).claimVictory(2);

      expect(await ach.ownerOf(1)).to.equal(creator.address);
      const a = await ach.achievementOf(1);
      expect(a.aType).to.equal(Victory);
    });

    it("emits AchievementMinted with Victory type", async function () {
      const { ach, creator } = await finalizedChallengeFixture();
      await expect(ach.connect(creator).claimVictory(2))
        .to.emit(ach, "AchievementMinted")
        .withArgs(1, 2, creator.address, Victory);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Eligibility guards
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Eligibility", function () {
    it("non-participant cannot claimCompletion", async function () {
      const { ach, eve } = await finalizedChallengeFixture();
      await expect(
        ach.connect(eve).claimCompletion(2)
      ).to.be.revertedWithCustomError(ach, "NotParticipant");
    });

    it("non-winner cannot claimVictory", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      // alice participated but didn't submit proof → not a winner
      await expect(
        ach.connect(alice).claimVictory(2)
      ).to.be.revertedWithCustomError(ach, "NotWinner");
    });

    it("cannot claimCompletion before finalization", async function () {
      const { ach, cp, creator, alice, mockVerifier } =
        await loadFixture(deployFixture);
      const params = await defaultCreateParams(
        await mockVerifier.getAddress()
      );
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });
      await cp
        .connect(alice)
        .joinChallengeNative(2, { value: ONE_ETH });

      await expect(
        ach.connect(alice).claimCompletion(2)
      ).to.be.revertedWithCustomError(ach, "NotFinalized");
    });

    it("cannot claimVictory before finalization", async function () {
      const { ach, cp, creator, mockVerifier } =
        await loadFixture(deployFixture);
      const params = await defaultCreateParams(
        await mockVerifier.getAddress()
      );
      await cp.connect(creator).createChallenge(params, { value: ONE_ETH });

      await expect(
        ach.connect(creator).claimVictory(2)
      ).to.be.revertedWithCustomError(ach, "NotFinalized");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Double-mint protection
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Double-mint protection", function () {
    it("cannot claimCompletion twice for same challenge", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      await ach.connect(alice).claimCompletion(2);

      await expect(
        ach.connect(alice).claimCompletion(2)
      ).to.be.revertedWithCustomError(ach, "AlreadyMinted");
    });

    it("cannot claimVictory twice for same challenge", async function () {
      const { ach, creator } = await finalizedChallengeFixture();
      await ach.connect(creator).claimVictory(2);

      await expect(
        ach.connect(creator).claimVictory(2)
      ).to.be.revertedWithCustomError(ach, "AlreadyMinted");
    });

    it("same user can claim both Completion AND Victory for same challenge", async function () {
      const { ach, creator } = await finalizedChallengeFixture();
      await ach.connect(creator).claimCompletion(2);
      await ach.connect(creator).claimVictory(2);

      expect(await ach.ownerOf(1)).to.equal(creator.address);
      expect(await ach.ownerOf(2)).to.equal(creator.address);

      const a1 = await ach.achievementOf(1);
      const a2 = await ach.achievementOf(2);
      expect(a1.aType).to.equal(Completion);
      expect(a2.aType).to.equal(Victory);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Soulbound transfer restrictions
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Soulbound (non-transferable)", function () {
    it("transferFrom reverts", async function () {
      const { ach, alice, bob } = await finalizedChallengeFixture();
      await ach.connect(alice).claimCompletion(2);

      await expect(
        ach.connect(alice).transferFrom(alice.address, bob.address, 1)
      ).to.be.revertedWithCustomError(ach, "SoulboundToken");
    });

    it("safeTransferFrom reverts", async function () {
      const { ach, alice, bob } = await finalizedChallengeFixture();
      await ach.connect(alice).claimCompletion(2);

      await expect(
        ach
          .connect(alice)
          ["safeTransferFrom(address,address,uint256)"](
            alice.address,
            bob.address,
            1
          )
      ).to.be.revertedWithCustomError(ach, "SoulboundToken");
    });

    it("approve reverts", async function () {
      const { ach, alice, bob } = await finalizedChallengeFixture();
      await ach.connect(alice).claimCompletion(2);

      await expect(
        ach.connect(alice).approve(bob.address, 1)
      ).to.be.revertedWithCustomError(ach, "SoulboundToken");
    });

    it("setApprovalForAll reverts", async function () {
      const { ach, alice, bob } = await finalizedChallengeFixture();
      await ach.connect(alice).claimCompletion(2);

      await expect(
        ach.connect(alice).setApprovalForAll(bob.address, true)
      ).to.be.revertedWithCustomError(ach, "SoulboundToken");
    });

    it("locked() returns true for all tokens", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      await ach.connect(alice).claimCompletion(2);
      expect(await ach.locked(1)).to.be.true;
    });

    it("locked() reverts for non-existent token", async function () {
      const { ach } = await loadFixture(deployFixture);
      await expect(ach.locked(999)).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ERC-165 / ERC-5192
  // ═══════════════════════════════════════════════════════════════════════════
  describe("ERC-165", function () {
    it("supports ERC-721 interface", async function () {
      const { ach } = await loadFixture(deployFixture);
      // ERC-721: 0x80ac58cd
      expect(await ach.supportsInterface("0x80ac58cd")).to.be.true;
    });

    it("supports ERC-5192 interface", async function () {
      const { ach } = await loadFixture(deployFixture);
      // ERC-5192: 0xb45a3c0e
      expect(await ach.supportsInterface("0xb45a3c0e")).to.be.true;
    });

    it("supports ERC-165 interface", async function () {
      const { ach } = await loadFixture(deployFixture);
      // ERC-165: 0x01ffc9a7
      expect(await ach.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Admin functions
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Admin", function () {
    it("admin can mint for any recipient", async function () {
      const { ach, admin, alice } = await finalizedChallengeFixture();
      await ach.connect(admin).adminMint(alice.address, 2, Completion);

      expect(await ach.ownerOf(1)).to.equal(alice.address);
    });

    it("non-admin cannot adminMint", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      await expect(
        ach.connect(alice).adminMint(alice.address, 2, Completion)
      ).to.be.revertedWithCustomError(ach, "NotAdmin");
    });

    it("admin can set baseTokenURI", async function () {
      const { ach, admin } = await loadFixture(deployFixture);
      await ach.connect(admin).setBaseTokenURI("https://new.uri/");
      expect(await ach.baseTokenURI()).to.equal("https://new.uri/");
    });

    it("2-step admin transfer works", async function () {
      const { ach, admin, alice } = await loadFixture(deployFixture);
      await ach.connect(admin).transferAdmin(alice.address);
      expect(await ach.pendingAdmin()).to.equal(alice.address);
      expect(await ach.admin()).to.equal(admin.address);

      await ach.connect(alice).acceptAdmin();
      expect(await ach.admin()).to.equal(alice.address);
      expect(await ach.pendingAdmin()).to.equal(ethers.ZeroAddress);
    });

    it("non-pending cannot accept admin", async function () {
      const { ach, admin, alice, bob } = await loadFixture(deployFixture);
      await ach.connect(admin).transferAdmin(alice.address);

      await expect(
        ach.connect(bob).acceptAdmin()
      ).to.be.revertedWithCustomError(ach, "NotPendingAdmin");
    });

    it("adminMint is double-mint protected", async function () {
      const { ach, admin, alice } = await finalizedChallengeFixture();
      await ach.connect(admin).adminMint(alice.address, 2, Completion);

      await expect(
        ach.connect(admin).adminMint(alice.address, 2, Completion)
      ).to.be.revertedWithCustomError(ach, "AlreadyMinted");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // tokenURI
  // ═══════════════════════════════════════════════════════════════════════════
  describe("tokenURI", function () {
    it("returns baseURI + tokenId", async function () {
      const { ach, alice } = await finalizedChallengeFixture();
      await ach.connect(alice).claimCompletion(2);
      expect(await ach.tokenURI(1)).to.equal(
        "https://app.lightchallenge.ai/api/achievements/1"
      );
    });
  });
});
