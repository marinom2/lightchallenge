import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const F = await ethers.getContractFactory("AivmProofVerifier");
  const v = await F.deploy(deployer.address);
  await v.waitForDeployment();

  console.log("AivmProofVerifier deployed at:", await v.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
