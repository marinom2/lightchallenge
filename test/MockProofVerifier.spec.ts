import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockProofVerifier", () => {
  async function deploy() {
    const [owner, alice, bob, charlie] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MockProofVerifier");
    const mock = await F.deploy();
    await mock.waitForDeployment();
    return { mock, owner, alice, bob, charlie };
  }

  it("sets owner on deploy", async () => {
    const { mock, owner } = await deploy();
    expect(await mock.owner()).to.equal(owner.address);
  });

  it("only owner can setApproved and setOwner", async () => {
    const { mock, owner, alice } = await deploy();

    await expect(
      mock.connect(alice).setApproved(1, alice.address, true)
    ).to.be.revertedWith("not owner");

    await expect(mock.connect(owner).setApproved(1, alice.address, true))
      .to.emit(mock, "Approved")
      .withArgs(1, alice.address, true);

    await expect(mock.connect(alice).setOwner(alice.address)).to.be.revertedWith("not owner");

    await expect(mock.connect(owner).setOwner(alice.address))
      .to.emit(mock, "OwnershipTransferred")
      .withArgs(owner.address, alice.address);

    expect(await mock.owner()).to.equal(alice.address);
  });

  it("verify returns exactly the stored (id,subject) approval and ignores proof bytes", async () => {
    const { mock, owner, alice, bob } = await deploy();

    expect(await mock.verify(7, alice.address, "0x")).to.equal(false);

    await mock.connect(owner).setApproved(7, alice.address, true);

    expect(await mock.verify(7, alice.address, "0x")).to.equal(true);
    expect(await mock.verify(7, alice.address, "0x1234")).to.equal(true);

    expect(await mock.verify(7, bob.address, "0x")).to.equal(false);
    expect(await mock.verify(8, alice.address, "0x")).to.equal(false);

    await mock.connect(owner).setApproved(7, alice.address, false);
    expect(await mock.verify(7, alice.address, "0x")).to.equal(false);
  });

  it("separate (id, subject) entries do not collide", async () => {
    const { mock, owner, alice, bob, charlie } = await deploy();

    await mock.connect(owner).setApproved(1, alice.address, true);
    await mock.connect(owner).setApproved(2, alice.address, false);
    await mock.connect(owner).setApproved(1, bob.address, true);
    await mock.connect(owner).setApproved(2, charlie.address, true);

    expect(await mock.verify(1, alice.address, "0x")).to.equal(true);
    expect(await mock.verify(2, alice.address, "0x")).to.equal(false);
    expect(await mock.verify(1, bob.address, "0x")).to.equal(true);
    expect(await mock.verify(2, charlie.address, "0x")).to.equal(true);

    expect(await mock.verify(3, alice.address, "0x")).to.equal(false);
    expect(await mock.verify(1, charlie.address, "0x")).to.equal(false);
  });
});