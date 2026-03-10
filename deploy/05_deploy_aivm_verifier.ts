// deploy/05_deploy_aivm_verifier.ts

import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import {
  mergeDeployments,
  writeAbi,
} from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, getOrNull, log } = deployments;

  const { deployer } = await getNamedAccounts();
  const from = deployer ?? (await ethers.getSigners())[0].address;

  const owner =
    process.env.AIVM_OWNER ||
    process.env.ADMIN_ADDRESS ||
    from;

  const AIVM = process.env.AIVM_INFERENCE_V2_ADDRESS;

  if (!owner) throw new Error("Missing owner");
  if (!AIVM) throw new Error("Missing AIVM_INFERENCE_V2_ADDRESS");

  log(`\n🚀 AIVM PoI verifier deploy`);
  log(`network=${network.name}`);
  log(`deployer=${from}`);
  log(`owner=${owner}`);
  log(`AIVM=${AIVM}`);

  /* ------------------------------------------------------------- */
  /* Deploy ChallengeTaskRegistry                                  */
  /* ------------------------------------------------------------- */

  let taskRegistryAddr: string;

  const existingRegistry = await getOrNull("ChallengeTaskRegistry");

  if (existingRegistry?.address) {
    taskRegistryAddr = existingRegistry.address;
    log(`✓ Reusing ChallengeTaskRegistry @ ${taskRegistryAddr}`);
  } else {
    const res = await deploy("ChallengeTaskRegistry", {
      from,
      args: [owner],
      log: true,
      waitConfirmations: 1,
    });

    taskRegistryAddr = res.address;
    log(`✓ Deployed ChallengeTaskRegistry @ ${taskRegistryAddr}`);
  }

  /* ------------------------------------------------------------- */
  /* Deploy ChallengePayAivmPoiVerifier                            */
  /* ------------------------------------------------------------- */

  let verifierAddr: string;

  const existingVerifier = await getOrNull("ChallengePayAivmPoiVerifier");

  if (existingVerifier?.address) {
    verifierAddr = existingVerifier.address;
    log(`✓ Reusing ChallengePayAivmPoiVerifier @ ${verifierAddr}`);
  } else {
    const res = await deploy("ChallengePayAivmPoiVerifier", {
      from,
      args: [
        owner,
        AIVM,
        taskRegistryAddr,
      ],
      log: true,
      waitConfirmations: 1,
    });

    verifierAddr = res.address;

    log(`✓ Deployed ChallengePayAivmPoiVerifier @ ${verifierAddr}`);
  }

  /* ------------------------------------------------------------- */
  /* Save ABIs + deployment registry                               */
  /* ------------------------------------------------------------- */

  await writeAbi(
    hre,
    "ChallengePayAivmPoiVerifier",
    "ChallengePayAivmPoiVerifier.abi.json"
  );

  await writeAbi(
    hre,
    "ChallengeTaskRegistry",
    "ChallengeTaskRegistry.abi.json"
  );

  await mergeDeployments(hre, {
    ChallengeTaskRegistry: taskRegistryAddr,
    ChallengePayAivmPoiVerifier: verifierAddr,
  });

  log("\n✅ AIVM PoI verifier deployment complete");
};

export default func;

func.tags = ["AIVM", "POI", "verifiers"];