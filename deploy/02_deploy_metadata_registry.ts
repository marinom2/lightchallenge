import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 MetadataRegistry: network=${network.name} deployer=${deployer}`);

  const owner = process.env.METADATA_OWNER || deployer;

  const existing = await getOrNull("MetadataRegistry");
  if (!existing) {
    const d = await deploy("MetadataRegistry", {
      from: deployer,
      args: [owner],
      log: true,
      waitConfirmations: 1,
    });
    log(`✓ Deployed MetadataRegistry @ ${d.address}`);
  } else {
    log(`✓ Reusing MetadataRegistry @ ${existing.address}`);
  }

  const dep = await get("MetadataRegistry");

  await writeAbi(hre, "MetadataRegistry", "MetadataRegistry.abi.json");
  await mergeDeployments(hre, { MetadataRegistry: dep.address });
};

export default func;
func.tags = ["metadata"];
func.dependencies = [];