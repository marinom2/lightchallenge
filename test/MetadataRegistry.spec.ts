import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Tests aligned to your current MetadataRegistry.sol:
 *  - owner(), ownerSet(), uri(), transferOwnership()
 *  - challengerSet() through a tiny mock core that returns a challenger for an id
 */
describe("MetadataRegistry", () => {
  async function deployRegistry() {
    const [owner, alice, bob] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MetadataRegistry");
    const m = await F.deploy(owner.address);
    await m.waitForDeployment();
    return { m, owner, alice, bob };
  }

  async function deployMockCore() {
    const F = await ethers.getContractFactory("MockCoreForRegistry");
    const core = await F.deploy();
    await core.waitForDeployment();
    return core;
  }

  it("deploys with owner and reads empty URI by default", async () => {
    const { m, owner } = await deployRegistry();
    expect(await m.owner()).to.equal(owner.address);

    // For any (contract,id) pair, uri() should be empty initially
    const someContract = ethers.ZeroAddress;
    expect(await m.uri(someContract, 0)).to.equal("");
    expect(await m.uri(someContract, 123)).to.equal("");
  });

  it("only owner can ownerSet", async () => {
    const { m, alice } = await deployRegistry();
    await expect(
      m.connect(alice).ownerSet(ethers.ZeroAddress, 1, "ipfs://x")
    ).to.be.revertedWith("not owner");
  });

  it("ownerSet stores and emits; uri returns exact value", async () => {
    const { m, owner } = await deployRegistry();
    const target = ethers.ZeroAddress;
    await expect(m.connect(owner).ownerSet(target, 42, "ipfs://hash-42"))
      .to.emit(m, "MetadataSet")
      .withArgs(target, 42, owner.address, "ipfs://hash-42");

    expect(await m.uri(target, 42)).to.equal("ipfs://hash-42");
  });

  it("owner can overwrite; setting empty clears", async () => {
    const { m, owner } = await deployRegistry();
    const tgt = ethers.ZeroAddress;
    await m.connect(owner).ownerSet(tgt, 7, "ipfs://a");
    expect(await m.uri(tgt, 7)).to.equal("ipfs://a");

    await m.connect(owner).ownerSet(tgt, 7, "ipfs://b");
    expect(await m.uri(tgt, 7)).to.equal("ipfs://b");

    await m.connect(owner).ownerSet(tgt, 7, "");
    expect(await m.uri(tgt, 7)).to.equal("");
  });

  it("transferOwnership updates the owner and permissions", async () => {
    const { m, owner, bob } = await deployRegistry();
    await expect(m.connect(owner).transferOwnership(bob.address))
      .to.emit(m, "OwnershipTransferred")
      .withArgs(owner.address, bob.address);

    expect(await m.owner()).to.equal(bob.address);

    // Old owner cannot set anymore
    await expect(
      m.connect(owner).ownerSet(ethers.ZeroAddress, 1, "x")
    ).to.be.revertedWith("not owner");

    // New owner can set
    await m.connect(bob).ownerSet(ethers.ZeroAddress, 1, "ipfs://ok");
    expect(await m.uri(ethers.ZeroAddress, 1)).to.equal("ipfs://ok");
  });

  it("challengerSet: only challenger can set once; owner may overwrite later", async () => {
    const { m, owner, alice, bob } = await deployRegistry();
    const core = await deployMockCore();

    const chId = 11;

    // Set challenger for chId to alice
    await core.setChallenger(chId, alice.address);

    // Non-challenger cannot call challengerSet
    await expect(
      m.connect(bob).challengerSet(await core.getAddress(), chId, "ipfs://nope")
    ).to.be.revertedWith("not challenger");

    // Challenger can set once
    await expect(
      m.connect(alice).challengerSet(await core.getAddress(), chId, "ipfs://alice-1")
    )
      .to.emit(m, "MetadataSet")
      .withArgs(await core.getAddress(), chId, alice.address, "ipfs://alice-1");

    expect(await m.uri(await core.getAddress(), chId)).to.equal("ipfs://alice-1");

    // Challenger cannot set again (must be owner to overwrite)
    await expect(
      m.connect(alice).challengerSet(await core.getAddress(), chId, "ipfs://again")
    ).to.be.revertedWith("already set");

    // Owner can overwrite afterwards
    await m
      .connect(owner)
      .ownerSet(await core.getAddress(), chId, "ipfs://owner-overwrite");
    expect(await m.uri(await core.getAddress(), chId)).to.equal("ipfs://owner-overwrite");
  });
});