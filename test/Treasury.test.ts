import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const ONE_ETH = ethers.parseEther("1");

async function deployFixture() {
  const [deployer, admin, operator, alice, bob] = await ethers.getSigners();

  const TreasuryFactory = await ethers.getContractFactory("Treasury");
  const treasury = await TreasuryFactory.deploy(admin.address, operator.address);
  await treasury.waitForDeployment();

  // Deploy a simple ERC20 mock for testing
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy("TestToken", "TT", ethers.parseEther("1000000"));
  await token.waitForDeployment();

  // Give alice and bob some tokens
  await token.transfer(alice.address, ethers.parseEther("1000"));
  await token.transfer(bob.address, ethers.parseEther("1000"));

  // Alice and bob approve treasury
  const treasuryAddr = await treasury.getAddress();
  await token.connect(alice).approve(treasuryAddr, ethers.MaxUint256);
  await token.connect(bob).approve(treasuryAddr, ethers.MaxUint256);
  // Also operator approves for depositERC20From
  await token.transfer(operator.address, ethers.parseEther("1000"));
  await token.connect(operator).approve(treasuryAddr, ethers.MaxUint256);

  const OPERATOR_ROLE = await treasury.OPERATOR_ROLE();

  return { deployer, admin, operator, alice, bob, treasury, token, OPERATOR_ROLE };
}

describe("Treasury (SC-C2)", function () {
  describe("depositERC20From access control", function () {
    it("reverts for non-operator with mismatched from", async function () {
      const { treasury, alice, bob, token } = await loadFixture(deployFixture);
      const tokenAddr = await token.getAddress();

      // alice (non-operator) tries to deposit from bob's tokens
      await expect(
        treasury.connect(alice).depositERC20From(1, tokenAddr, bob.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(treasury, "BadParams");
    });

    it("allows OPERATOR_ROLE with any from", async function () {
      const { treasury, operator, alice, token } = await loadFixture(deployFixture);
      const tokenAddr = await token.getAddress();

      // operator can deposit from alice (who has approved treasury)
      await treasury
        .connect(operator)
        .depositERC20From(1, tokenAddr, alice.address, ethers.parseEther("10"));

      const balance = await treasury.bucketErc20Balance(tokenAddr, 1);
      expect(balance).to.equal(ethers.parseEther("10"));
    });

    it("allows non-operator when from == msg.sender", async function () {
      const { treasury, alice, token } = await loadFixture(deployFixture);
      const tokenAddr = await token.getAddress();

      // alice deposits from herself (non-operator, but from == msg.sender)
      await treasury
        .connect(alice)
        .depositERC20From(1, tokenAddr, alice.address, ethers.parseEther("10"));

      const balance = await treasury.bucketErc20Balance(tokenAddr, 1);
      expect(balance).to.equal(ethers.parseEther("10"));
    });
  });

  // SC-M5: claimETHTo permissionless-by-design behavior
  describe("claimETHTo permissionless delivery (SC-M5)", function () {
    it("bob can trigger claimETHTo for alice; funds go to alice", async function () {
      const { treasury, operator, alice, bob } = await loadFixture(deployFixture);

      const grantAmount = ethers.parseEther("2");
      const bucketId = 2;

      // Deposit ETH into bucket 2 (anyone can call depositETH)
      await treasury.connect(operator).depositETH(bucketId, { value: grantAmount });

      // Grant allowance to alice for bucket 2
      await treasury.connect(operator).grantETH(bucketId, alice.address, grantAmount);

      // Verify alice has allowance
      expect(await treasury.ethAllowanceOf(bucketId, alice.address)).to.equal(grantAmount);

      // Record balances before
      const aliceBefore = await ethers.provider.getBalance(alice.address);
      const bobBefore = await ethers.provider.getBalance(bob.address);

      // Bob calls claimETHTo for alice
      const tx = await treasury.connect(bob).claimETHTo(bucketId, alice.address, grantAmount);
      const receipt = await tx.wait();
      const bobGasCost = receipt!.gasUsed * receipt!.gasPrice;

      // Verify alice received the funds
      const aliceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceAfter - aliceBefore).to.equal(grantAmount);

      // Verify bob's balance decreased (only gas, no funds gained)
      const bobAfter = await ethers.provider.getBalance(bob.address);
      expect(bobBefore - bobAfter).to.equal(bobGasCost);

      // Verify alice's allowance is now zero
      expect(await treasury.ethAllowanceOf(bucketId, alice.address)).to.equal(0);
    });
  });
});
