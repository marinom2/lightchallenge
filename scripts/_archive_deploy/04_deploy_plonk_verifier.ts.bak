import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 PlonkVerifier: network=${network.name} deployer=${deployer}`);

  const existing = await getOrNull("PlonkVerifier");
  if (!existing) {
    const d = await deploy("PlonkVerifier", {
      from: deployer,
      args: [],
      log: true,
      waitConfirmations: 1,
    });
    log(`✓ Deployed PlonkVerifier @ ${d.address}`);
  } else {
    log(`✓ Reusing PlonkVerifier @ ${existing.address}`);
  }

  const dep = await get("PlonkVerifier");
  await writeAbi(hre, "PlonkVerifier", "PlonkVerifier.abi.json");
  await mergeDeployments(hre, { PlonkVerifier: dep.address });
};

export default func;
func.tags = ["zk", "plonk"];