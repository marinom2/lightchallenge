import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, getOrNull, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 Treasury: network=${network.name} deployer=${deployer}`);

  const admin = process.env.ADMIN_ADDRESS || deployer;
  const initialOperator = process.env.TREASURY_INITIAL_OPERATOR || deployer;

  const existing = await getOrNull("Treasury");
  if (existing?.address) {
    log(`✓ Reusing Treasury @ ${existing.address}`);
    await writeAbi(hre, "Treasury", "Treasury.abi.json");
    await mergeDeployments(hre, { Treasury: existing.address });
    return;
  }

  const res = await deploy("Treasury", {
    from: deployer,
    args: [admin, initialOperator],
    log: true,
    waitConfirmations: 1,
  });

  log(`✅ Treasury deployed @ ${res.address}`);

  await writeAbi(hre, "Treasury", "Treasury.abi.json");
  await mergeDeployments(hre, { Treasury: res.address });
};

export default func;
func.tags = ["Treasury"];