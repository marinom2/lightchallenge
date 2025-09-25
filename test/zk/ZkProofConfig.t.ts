import { expect } from "chai";
import { ethers } from "hardhat";

describe("ZkProofConfig", function () {
  it("deploys ZkProofVerifier with zero args and has empty model by default", async function () {
    const F = await ethers.getContractFactory("ZkProofVerifier");
    const zk = await F.deploy(); // <-- NO constructor args
    await zk.waitForDeployment();

    const label = "dummy@0";
    const modelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
    const m = await zk.models(modelHash);

    // tuple: [verifier, (maybe version/nonce), active, enforce]
    expect(m[0]).to.equal(ethers.ZeroAddress);
    expect(m[2]).to.equal(false);
    expect(m[3]).to.equal(false);
  });
});
