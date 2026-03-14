import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

/**
 * deploy/11_deploy_achievement.ts
 *
 * Deploys ChallengeAchievement — soulbound (ERC-721 + ERC-5192) achievement
 * tokens for LightChallenge. Reads ChallengePay on-chain state for eligibility.
 *
 * Constructor args:
 *   1. ChallengePay address (from prior deployment)
 *   2. Admin address (ADMIN_ADDRESS env, or deployer)
 *   3. Base token URI (ACHIEVEMENT_BASE_URI env, or default)
 *
 * Usage:
 *   npx hardhat deploy --network lightchain --tags achievement
 *   REDEPLOY_ACHIEVEMENT=1 npx hardhat deploy --network lightchain --tags achievement
 */
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🏆 ChallengeAchievement: network=${network.name} deployer=${deployer}`);

  // ---------------------------------------------------------------------------
  // Resolve constructor params
  // ---------------------------------------------------------------------------
  const cpDeploy = await getOrNull("ChallengePay");
  const CHALLENGE_PAY =
    cpDeploy?.address ||
    process.env.CHALLENGEPAY_ADDRESS ||
    process.env.NEXT_PUBLIC_CHALLENGEPAY_ADDR ||
    "";

  if (!CHALLENGE_PAY) {
    throw new Error(
      "Missing ChallengePay address. Deploy ChallengePay first or set CHALLENGEPAY_ADDRESS."
    );
  }

  const ADMIN =
    process.env.ADMIN_ADDRESS || deployer;

  const BASE_URI =
    process.env.ACHIEVEMENT_BASE_URI ||
    `${process.env.NEXT_PUBLIC_BASE_URL || "https://app.lightchallenge.ai"}/api/achievements/`;

  // ---------------------------------------------------------------------------
  // Deploy or reuse
  // ---------------------------------------------------------------------------
  const forceRedeploy =
    process.env.REDEPLOY_ACHIEVEMENT === "1" ||
    process.env.REDEPLOY_ACHIEVEMENT === "true";

  const existing = await getOrNull("ChallengeAchievement");

  if (!existing || forceRedeploy) {
    const res = await deploy("ChallengeAchievement", {
      from: deployer,
      args: [CHALLENGE_PAY, ADMIN, BASE_URI],
      log: true,
      waitConfirmations: 1,
    });

    log(
      existing
        ? `✓ REDEPLOYED ChallengeAchievement @ ${res.address} (prev ${existing.address})`
        : `✓ Deployed ChallengeAchievement @ ${res.address}`
    );
  } else {
    log(`✓ Reusing ChallengeAchievement @ ${existing.address}`);
  }

  const dep = await get("ChallengeAchievement");
  const achAddr = dep.address;

  // ---------------------------------------------------------------------------
  // Optional: initiate 2-step admin transfer
  // ---------------------------------------------------------------------------
  if (process.env.ADMIN_ADDRESS && process.env.ADMIN_ADDRESS.toLowerCase() !== deployer.toLowerCase()) {
    const signer = await hre.ethers.getSigner(deployer);
    const AchAdminAbi = [
      "function admin() view returns (address)",
      "function transferAdmin(address)",
    ] as const;
    const ach = new hre.ethers.Contract(achAddr, AchAdminAbi, signer);

    try {
      const currentAdmin: string = await ach.admin();
      if (currentAdmin.toLowerCase() === process.env.ADMIN_ADDRESS.toLowerCase()) {
        log(`• ChallengeAchievement admin already ${process.env.ADMIN_ADDRESS}`);
      } else if (currentAdmin.toLowerCase() !== deployer.toLowerCase()) {
        log(`⚠️ ChallengeAchievement admin is ${currentAdmin} (not deployer); cannot transferAdmin`);
      } else {
        const tx = await ach.transferAdmin(process.env.ADMIN_ADDRESS);
        await tx.wait();
        log(`✓ ChallengeAchievement.transferAdmin(${process.env.ADMIN_ADDRESS}) — new admin must call acceptAdmin()`);
      }
    } catch (e: any) {
      log(`⚠️ Admin transfer failed: ${e?.shortMessage || e?.message || String(e)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Webapp exports
  // ---------------------------------------------------------------------------
  log(`\n🧾 Writing webapp ABI for ChallengeAchievement...`);
  await writeAbi(hre, "ChallengeAchievement", "ChallengeAchievement.abi.json");

  log(`\n🧾 Merging ChallengeAchievement into webapp deployments...`);
  await mergeDeployments(hre, {
    ChallengeAchievement: achAddr,
  });

  log(`✅ ChallengeAchievement deployed and webapp files updated\n`);
};

func.tags = ["achievement"];
func.dependencies = ["ChallengePay"];

export default func;
