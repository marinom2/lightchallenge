import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 ZkProofVerifier: network=${network.name} deployer=${deployer}`);

  const initialOwner = process.env.ADMIN_ADDRESS || deployer;

  const existing = await getOrNull("ZkProofVerifier");
  if (!existing) {
    const res = await deploy("ZkProofVerifier", {
      from: deployer,
      args: [initialOwner],
      log: true,
      waitConfirmations: 1,
    });
    log(`✓ Deployed ZkProofVerifier @ ${res.address}`);
  } else {
    log(`✓ Reusing ZkProofVerifier @ ${existing.address}`);
  }

  const dep = await get("ZkProofVerifier");

  // Optional: register a model
  const mh = process.env.MODEL_HASH;
  const plonkVerifier = process.env.VERIFIER_ADDR || process.env.PLONK_VERIFIER;
  const enforce = (process.env.ENFORCE_BINDING ?? "true").toLowerCase() === "true";

  if (mh && plonkVerifier) {
    const signer = await ethers.getSigner(deployer);
    const zk = await ethers.getContractAt("ZkProofVerifier", dep.address, signer);
    const tx = await zk.setModel(mh as `0x${string}`, plonkVerifier, true, enforce);
    await tx.wait();
    log(`✓ Model registered: ${mh} -> ${plonkVerifier} (enforceBinding=${enforce})`);
  }

  await writeAbi(hre, "ZkProofVerifier", "ZkProofVerifier.abi.json");
  await mergeDeployments(hre, { ZkProofVerifier: dep.address });
};

export default func;
func.tags = ["zk", "verifiers"];