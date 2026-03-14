import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi, hasCode } from "../scripts/deploy-utils/_shared";

/**
 * deploy/09_deploy_challengepay.ts
 *
 * Deploys (or reuses) ChallengePay, optionally sets admin/owner (interface-aware),
 * tries to grant Treasury OPERATOR_ROLE (permission-aware),
 * then writes webapp ABI + merges webapp deployments file.
 *
 * FORCE redeploy:
 *   REDEPLOY_CHALLENGEPAY=1 npx hardhat deploy --tags ChallengePay --network lightchain
 */
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 ChallengePay: network=${network.name} deployer=${deployer}`);

  // ---------------------------------------------------------------------------
  // Resolve constructor params
  // ---------------------------------------------------------------------------
  const treasuryFromDeploy = (await getOrNull("Treasury"))?.address;

  const TREASURY =
    treasuryFromDeploy ||
    process.env.TREASURY_ADDR ||
    process.env.TREASURY ||
    "";

  if (!TREASURY) {
    throw new Error(
      `Missing Treasury address. Either deploy Treasury first (hardhat-deploy "Treasury"), or set TREASURY_ADDR / TREASURY in env.`
    );
  }

  const PROTOCOL =
    process.env.PROTOCOL_ADDR ||
    process.env.PROTOCOL_SAFE ||
    process.env.ADMIN_ADDRESS ||
    deployer;

  if (!(await hasCode(hre, TREASURY))) {
    throw new Error(
      `Treasury at ${TREASURY} has no code. Deploy Treasury first or fix TREASURY_ADDR/TREASURY.`
    );
  }

  // ---------------------------------------------------------------------------
  // Deploy or reuse ChallengePay
  // ---------------------------------------------------------------------------
  const forceRedeploy =
    process.env.REDEPLOY_CHALLENGEPAY === "1" ||
    process.env.REDEPLOY_CHALLENGEPAY === "true";

  const existing = await getOrNull("ChallengePay");

  if (!existing || forceRedeploy) {
    const res = await deploy("ChallengePay", {
      from: deployer,
      args: [TREASURY, PROTOCOL],
      log: true,
      waitConfirmations: 1,
    });

    log(
      existing
        ? `✓ REDEPLOYED ChallengePay @ ${res.address} (prev ${existing.address})`
        : `✓ Deployed ChallengePay @ ${res.address}`
    );
  } else {
    log(`✓ Reusing ChallengePay @ ${existing.address}`);
  }

  const dep = await get("ChallengePay");
  const cpAddr = dep.address;

  // ---------------------------------------------------------------------------
  // Optional: initiate 2-step admin transfer to ADMIN_ADDRESS
  // The new admin must call acceptAdmin() separately to complete the transfer.
  // ---------------------------------------------------------------------------
  const adminTo = process.env.ADMIN_ADDRESS;
  if (adminTo) {
    const signer = await ethers.getSigner(deployer);

    const ChallengePayAdminAbi = [
      "function admin() view returns (address)",
      "function transferAdmin(address)",
    ] as const;

    const cp = new ethers.Contract(cpAddr, ChallengePayAdminAbi, signer);

    try {
      const currentAdmin: string = await cp.admin();
      if (currentAdmin.toLowerCase() === adminTo.toLowerCase()) {
        log(`• ChallengePay admin already ${adminTo}`);
      } else if (currentAdmin.toLowerCase() !== deployer.toLowerCase()) {
        log(`⚠️ ChallengePay admin is ${currentAdmin} (not deployer); cannot transferAdmin`);
      } else {
        const tx = await cp.transferAdmin(adminTo);
        await tx.wait();
        log(`✓ ChallengePay.transferAdmin(${adminTo}) — new admin must call acceptAdmin()`);
      }
    } catch (e: any) {
      log(`⚠️ ChallengePay admin transfer failed: ${e?.shortMessage || e?.message || String(e)}`);
    }
  } else {
    log(`• ADMIN_ADDRESS not set; leaving ChallengePay admin as-is`);
  }

  // ---------------------------------------------------------------------------
  // CRITICAL: grant OPERATOR_ROLE on Treasury to ChallengePay (permission-aware)
  // ---------------------------------------------------------------------------
  {
    const signer = await ethers.getSigner(deployer);

    // Minimal ABI for role checks + grants
    const TreasuryRoleAbi = [
      "function OPERATOR_ROLE() view returns (bytes32)",
      "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
      "function getRoleAdmin(bytes32 role) view returns (bytes32)",
      "function hasRole(bytes32 role, address account) view returns (bool)",
      "function grantRole(bytes32 role, address account)",
    ] as const;

    const treasury = new ethers.Contract(TREASURY, TreasuryRoleAbi, signer);

    const OPERATOR_ROLE: string = await treasury.OPERATOR_ROLE();
    const already = await treasury.hasRole(OPERATOR_ROLE, cpAddr);

    if (already) {
      log(`• ChallengePay already has OPERATOR_ROLE on Treasury`);
    } else {
      const roleAdmin: string = await treasury.getRoleAdmin(OPERATOR_ROLE);
      const canGrant: boolean = await treasury.hasRole(roleAdmin, deployer);

      if (!canGrant) {
        const DEFAULT_ADMIN_ROLE: string = await treasury.DEFAULT_ADMIN_ROLE();
        const deployerIsDefaultAdmin: boolean = await treasury.hasRole(
          DEFAULT_ADMIN_ROLE,
          deployer
        );

        log(`\n⚠️ Treasury.grantRole(OPERATOR_ROLE, ChallengePay) skipped (no permission).`);
        log(`   Treasury: ${TREASURY}`);
        log(`   ChallengePay: ${cpAddr}`);
        log(`   OPERATOR_ROLE: ${OPERATOR_ROLE}`);
        log(`   OPERATOR_ROLE admin: ${roleAdmin}`);
        log(`   deployer has OPERATOR_ROLE admin? ${canGrant}`);
        log(`   deployer has DEFAULT_ADMIN_ROLE? ${deployerIsDefaultAdmin}`);
        log(
          `\n✅ ACTION REQUIRED: run grantRole from the Treasury admin wallet (Safe / admin EOA), then re-run deploy to refresh webapp files if needed.`
        );
        log(`   Call: Treasury.grantRole(OPERATOR_ROLE, ${cpAddr})\n`);
      } else {
        const tx = await treasury.grantRole(OPERATOR_ROLE, cpAddr);
        await tx.wait();
        log(`✓ Treasury.grantRole(OPERATOR_ROLE, ChallengePay)`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Webapp exports
  // ---------------------------------------------------------------------------
  log(`\n🧾 Writing webapp ABI for ChallengePay...`);
  await writeAbi(hre, "ChallengePay", "ChallengePay.abi.json");
  log(`✓ wrote webapp/public/abi/ChallengePay.abi.json`);

  log(`\n🧾 Merging ChallengePay into webapp/public/deployments/lightchain.json...`);
  await mergeDeployments(hre, {
    Treasury: TREASURY,
    ChallengePay: cpAddr,
    Protocol: PROTOCOL,
  });
  log(`✓ updated webapp/public/deployments/lightchain.json (ChallengePay=${cpAddr})`);

  // ---------------------------------------------------------------------------
  // Extra sanity checks
  // ---------------------------------------------------------------------------
  {
    const { existsSync } = await import("fs");
    const { join } = await import("path");

    const abiPath = join(process.cwd(), "webapp", "public", "abi", "ChallengePay.abi.json");
    const depPath = join(process.cwd(), "webapp", "public", "deployments", "lightchain.json");

    if (!existsSync(abiPath)) throw new Error(`Missing ${abiPath}`);
    if (!existsSync(depPath)) throw new Error(`Missing ${depPath}`);

    log(`✅ Sanity OK: webapp ABI + deployments file exist`);
    log(`   - ${abiPath}`);
    log(`   - ${depPath}\n`);
  }
};

func.tags = ["ChallengePay"];
func.dependencies = ["Treasury"];

export default func;