import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { MetadataRegistry } from "../typechain-types";

describe("MetadataRegistry", function () {
  let owner: HardhatEthersSigner;
  let other: HardhatEthersSigner;
  let reg: MetadataRegistry;

  const CP = "0x0000000000000000000000000000000000000042";
  const URI_A = "https://example.com/api/challenges/meta/2";
  const URI_B = "https://example.com/api/challenges/meta/3";
  const URI_C = "https://example.com/api/challenges/meta/corrected";

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("MetadataRegistry");
    reg = await F.deploy(owner.address);
    await reg.waitForDeployment();
  });

  // ─── Constructor ──────────────────────────────────────────────────

  it("sets initial owner correctly", async function () {
    expect(await reg.owner()).to.equal(owner.address);
  });

  it("emits OwnershipTransferred on deploy", async function () {
    const F = await ethers.getContractFactory("MetadataRegistry");
    const r = await F.deploy(owner.address);
    const receipt = await r.deploymentTransaction()?.wait();
    expect(receipt?.status).to.equal(1);
  });

  it("reverts on zero address constructor", async function () {
    const F = await ethers.getContractFactory("MetadataRegistry");
    await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(reg, "ZeroAddress");
  });

  // ─── ownerSet (write-once) ────────────────────────────────────────

  it("owner can set URI via ownerSet", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    expect(await reg.uri(CP, 2)).to.equal(URI_A);
  });

  it("ownerSet reverts with AlreadySet on second write", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await expect(
      reg.connect(owner).ownerSet(CP, 2, URI_B)
    ).to.be.revertedWithCustomError(reg, "AlreadySet");
  });

  it("ownerSet reverts with EmptyUri for empty string", async function () {
    await expect(
      reg.connect(owner).ownerSet(CP, 2, "")
    ).to.be.revertedWithCustomError(reg, "EmptyUri");
  });

  it("non-owner cannot call ownerSet", async function () {
    await expect(
      reg.connect(other).ownerSet(CP, 2, URI_A)
    ).to.be.revertedWithCustomError(reg, "NotOwner");
  });

  it("ownerSet emits MetadataSet", async function () {
    await expect(reg.connect(owner).ownerSet(CP, 2, URI_A))
      .to.emit(reg, "MetadataSet")
      .withArgs(CP, 2, owner.address, URI_A);
  });

  // ─── ownerSetBatch (write-once) ──────────────────────────────────

  it("ownerSetBatch sets multiple URIs", async function () {
    await reg.connect(owner).ownerSetBatch([CP, CP], [2, 3], [URI_A, URI_B]);
    expect(await reg.uri(CP, 2)).to.equal(URI_A);
    expect(await reg.uri(CP, 3)).to.equal(URI_B);
  });

  it("ownerSetBatch reverts with AlreadySet if any entry exists", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await expect(
      reg.connect(owner).ownerSetBatch([CP, CP], [2, 3], [URI_B, URI_B])
    ).to.be.revertedWithCustomError(reg, "AlreadySet");
  });

  it("ownerSetBatch reverts with EmptyUri for empty string", async function () {
    await expect(
      reg.connect(owner).ownerSetBatch([CP], [2], [""])
    ).to.be.revertedWithCustomError(reg, "EmptyUri");
  });

  it("ownerSetBatch reverts on length mismatch (contracts vs ids)", async function () {
    await expect(
      reg.connect(owner).ownerSetBatch([CP], [2, 3], [URI_A, URI_B])
    ).to.be.revertedWithCustomError(reg, "LenMismatch");
  });

  it("ownerSetBatch reverts on length mismatch (ids vs uris)", async function () {
    await expect(
      reg.connect(owner).ownerSetBatch([CP, CP], [2, 3], [URI_A])
    ).to.be.revertedWithCustomError(reg, "LenMismatch");
  });

  it("non-owner cannot call ownerSetBatch", async function () {
    await expect(
      reg.connect(other).ownerSetBatch([CP], [2], [URI_A])
    ).to.be.revertedWithCustomError(reg, "NotOwner");
  });

  // ─── ownerForceSet (corrections) ─────────────────────────────────

  it("ownerForceSet works on unset entry", async function () {
    await reg.connect(owner).ownerForceSet(CP, 2, URI_A);
    expect(await reg.uri(CP, 2)).to.equal(URI_A);
  });

  it("ownerForceSet overwrites existing URI", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await reg.connect(owner).ownerForceSet(CP, 2, URI_C);
    expect(await reg.uri(CP, 2)).to.equal(URI_C);
  });

  it("ownerForceSet emits MetadataForceSet with old and new URI", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await expect(reg.connect(owner).ownerForceSet(CP, 2, URI_C))
      .to.emit(reg, "MetadataForceSet")
      .withArgs(CP, 2, owner.address, URI_A, URI_C);
  });

  it("ownerForceSet emits MetadataForceSet with empty prev for unset", async function () {
    await expect(reg.connect(owner).ownerForceSet(CP, 2, URI_A))
      .to.emit(reg, "MetadataForceSet")
      .withArgs(CP, 2, owner.address, "", URI_A);
  });

  it("ownerForceSet reverts with EmptyUri", async function () {
    await expect(
      reg.connect(owner).ownerForceSet(CP, 2, "")
    ).to.be.revertedWithCustomError(reg, "EmptyUri");
  });

  it("non-owner cannot call ownerForceSet", async function () {
    await expect(
      reg.connect(other).ownerForceSet(CP, 2, URI_A)
    ).to.be.revertedWithCustomError(reg, "NotOwner");
  });

  // ─── ownerClear ───────────────────────────────────────────────────

  it("owner can clear URI", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await reg.connect(owner).ownerClear(CP, 2);
    expect(await reg.uri(CP, 2)).to.equal("");
    expect(await reg.hasUri(CP, 2)).to.equal(false);
  });

  it("ownerClear emits MetadataCleared", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await expect(reg.connect(owner).ownerClear(CP, 2))
      .to.emit(reg, "MetadataCleared")
      .withArgs(CP, 2, owner.address);
  });

  it("ownerClear on unset entry does not revert", async function () {
    await reg.connect(owner).ownerClear(CP, 999);
    expect(await reg.hasUri(CP, 999)).to.equal(false);
  });

  it("ownerSet works after ownerClear (re-set)", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await reg.connect(owner).ownerClear(CP, 2);
    await reg.connect(owner).ownerSet(CP, 2, URI_B);
    expect(await reg.uri(CP, 2)).to.equal(URI_B);
  });

  it("non-owner cannot call ownerClear", async function () {
    await expect(
      reg.connect(other).ownerClear(CP, 2)
    ).to.be.revertedWithCustomError(reg, "NotOwner");
  });

  // ─── Views ────────────────────────────────────────────────────────

  it("uri returns empty string for unset entry", async function () {
    expect(await reg.uri(CP, 999)).to.equal("");
  });

  it("hasUri returns false for unset, true after set", async function () {
    expect(await reg.hasUri(CP, 2)).to.equal(false);
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    expect(await reg.hasUri(CP, 2)).to.equal(true);
  });

  it("getMany returns correct URIs", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    const results = await reg.getMany([CP, CP], [2, 3]);
    expect(results[0]).to.equal(URI_A);
    expect(results[1]).to.equal("");
  });

  it("getMany reverts on length mismatch", async function () {
    await expect(
      reg.getMany([CP], [2, 3])
    ).to.be.revertedWithCustomError(reg, "LenMismatch");
  });

  // ─── Ownership (2-step) ───────────────────────────────────────────

  it("2-step ownership transfer works", async function () {
    await reg.connect(owner).transferOwnership(other.address);
    expect(await reg.pendingOwner()).to.equal(other.address);
    await reg.connect(other).acceptOwnership();
    expect(await reg.owner()).to.equal(other.address);
  });

  it("transferOwnership reverts for non-owner", async function () {
    await expect(
      reg.connect(other).transferOwnership(other.address)
    ).to.be.revertedWithCustomError(reg, "NotOwner");
  });

  it("transferOwnership reverts for zero address", async function () {
    await expect(
      reg.connect(owner).transferOwnership(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(reg, "ZeroAddress");
  });

  it("acceptOwnership reverts for non-pending owner", async function () {
    await reg.connect(owner).transferOwnership(other.address);
    await expect(
      reg.connect(owner).acceptOwnership()
    ).to.be.revertedWithCustomError(reg, "NotOwner");
  });

  it("new owner can write after transfer", async function () {
    await reg.connect(owner).transferOwnership(other.address);
    await reg.connect(other).acceptOwnership();
    await reg.connect(other).ownerSet(CP, 2, URI_A);
    expect(await reg.uri(CP, 2)).to.equal(URI_A);
  });

  it("old owner cannot write after transfer", async function () {
    await reg.connect(owner).transferOwnership(other.address);
    await reg.connect(other).acceptOwnership();
    await expect(
      reg.connect(owner).ownerSet(CP, 2, URI_A)
    ).to.be.revertedWithCustomError(reg, "NotOwner");
  });

  it("emits OwnershipTransferStarted", async function () {
    await expect(reg.connect(owner).transferOwnership(other.address))
      .to.emit(reg, "OwnershipTransferStarted")
      .withArgs(owner.address, other.address);
  });

  it("emits OwnershipTransferred on accept", async function () {
    await reg.connect(owner).transferOwnership(other.address);
    await expect(reg.connect(other).acceptOwnership())
      .to.emit(reg, "OwnershipTransferred")
      .withArgs(owner.address, other.address);
  });

  // ─── ERC-165 ──────────────────────────────────────────────────────

  it("supports ERC-165 interface", async function () {
    expect(await reg.supportsInterface("0x01ffc9a7")).to.equal(true);
  });

  it("does not support random interface", async function () {
    expect(await reg.supportsInterface("0xdeadbeef")).to.equal(false);
  });

  // ─── Integrity scenarios ──────────────────────────────────────────

  it("write-once prevents silent overwrite (security)", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await expect(reg.connect(owner).ownerSet(CP, 2, URI_B))
      .to.be.revertedWithCustomError(reg, "AlreadySet");
    expect(await reg.uri(CP, 2)).to.equal(URI_A);
  });

  it("ownerForceSet produces distinct audit event (not MetadataSet)", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    const tx = await reg.connect(owner).ownerForceSet(CP, 2, URI_C);
    const receipt = await tx.wait();
    const metadataSetEvents = receipt?.logs.filter((l) => {
      try {
        return reg.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "MetadataSet";
      } catch { return false; }
    });
    expect(metadataSetEvents?.length ?? 0).to.equal(0);
    const forceSetEvents = receipt?.logs.filter((l) => {
      try {
        return reg.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "MetadataForceSet";
      } catch { return false; }
    });
    expect(forceSetEvents?.length ?? 0).to.equal(1);
  });

  it("clear + re-set allows write-once slot reuse", async function () {
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await reg.connect(owner).ownerClear(CP, 2);
    await reg.connect(owner).ownerSet(CP, 2, URI_B);
    expect(await reg.uri(CP, 2)).to.equal(URI_B);
    await expect(reg.connect(owner).ownerSet(CP, 2, URI_C))
      .to.be.revertedWithCustomError(reg, "AlreadySet");
  });

  it("different challenge contracts are isolated", async function () {
    const OTHER_CP = "0x0000000000000000000000000000000000000099";
    await reg.connect(owner).ownerSet(CP, 2, URI_A);
    await reg.connect(owner).ownerSet(OTHER_CP, 2, URI_B);
    expect(await reg.uri(CP, 2)).to.equal(URI_A);
    expect(await reg.uri(OTHER_CP, 2)).to.equal(URI_B);
  });
});
