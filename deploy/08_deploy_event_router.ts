import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi, hasCode, runPostDeployConfigIfEnabled } from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, getOrNull, getOrNull: getNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 EventChallengeRouter: network=${network.name} deployer=${deployer}`);

  const cpDep = await getNull("ChallengePay");
  const mrDep = await getNull("MetadataRegistry");

  const challengePay = cpDep?.address || process.env.CHALLENGEPAY_ADDR;
  const metadataRegistry = mrDep?.address || process.env.METADATA_REGISTRY_ADDR;

  if (!challengePay) throw new Error("Missing ChallengePay (deploy it first or set CHALLENGEPAY_ADDR)");
  if (!metadataRegistry) throw new Error("Missing MetadataRegistry (deploy it first or set METADATA_REGISTRY_ADDR)");

  if (!(await hasCode(hre, challengePay))) throw new Error(`ChallengePay at ${challengePay} has no code`);
  if (!(await hasCode(hre, metadataRegistry))) throw new Error(`MetadataRegistry at ${metadataRegistry} has no code`);

  const existing = await getOrNull("EventChallengeRouter");
  if (!existing) {
    const d = await deploy("EventChallengeRouter", {
      from: deployer,
      args: [challengePay, metadataRegistry],
      log: true,
      waitConfirmations: 1,
    });
    log(`✓ Deployed EventChallengeRouter @ ${d.address}`);
  } else {
    log(`✓ Reusing EventChallengeRouter @ ${existing.address}`);
  }

  const dep = await get("EventChallengeRouter");

  await writeAbi(hre, "EventChallengeRouter", "EventChallengeRouter.abi.json");
  await mergeDeployments(hre, {
    ChallengePay: challengePay,
    MetadataRegistry: metadataRegistry,
    EventChallengeRouter: dep.address,
  });

  // ✅ 1-command redeploy: runs admin config automatically (AIVM policy, etc.)
  await runPostDeployConfigIfEnabled(hre);
};

export default func;
func.tags = ["router"];
func.dependencies = ["ChallengePay", "metadata"];