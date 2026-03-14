import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 AutoApprovalStrategy: network=${network.name} deployer=${deployer}`);

  const existing = await getOrNull("AutoApprovalStrategy");
  if (!existing) {
    const res = await deploy("AutoApprovalStrategy", {
      from: deployer,
      args: [],
      log: true,
      waitConfirmations: 1,
    });
    log(`✓ Deployed AutoApprovalStrategy @ ${res.address}`);
  } else {
    log(`✓ Reusing AutoApprovalStrategy @ ${existing.address}`);
  }

  const stratDep = await get("AutoApprovalStrategy");
  const signer = await ethers.getSigner(deployer);
  const strategy = await ethers.getContractAt("AutoApprovalStrategy", stratDep.address, signer);

  // Policy (env-driven)
  const MIN_LEAD = Number(process.env.STRAT_MIN_LEAD || 120); // seconds
  const MAX_DUR = Number(process.env.STRAT_MAX_DUR || 30 * 24 * 3600); // seconds
  const ALLOW_NATIVE = (process.env.STRAT_ALLOW_NATIVE ?? "true").toLowerCase() === "true";
  const REQ_CREATOR_LIST = (process.env.STRAT_REQUIRE_CREATOR_ALLOWLIST ?? "false").toLowerCase() === "true";

  // Best-effort idempotent calls (won’t hurt if already set)
  await (await strategy.setLeadAndDuration(MIN_LEAD, MAX_DUR)).wait();
  await (await strategy.setNativeAllowed(ALLOW_NATIVE)).wait();
  await (await strategy.setRequireCreatorAllowlist(REQ_CREATOR_LIST)).wait();

  const erc20 = (process.env.STRAT_ERC20_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const t of erc20) {
    await (await strategy.setERC20Allowed(t, true)).wait();
  }

  const creators = (process.env.STRAT_CREATOR_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const w of creators) {
    await (await strategy.setCreatorAllowed(w, true)).wait();
  }

  await writeAbi(hre, "AutoApprovalStrategy", "AutoApprovalStrategy.abi.json");
  await mergeDeployments(hre, { AutoApprovalStrategy: stratDep.address });
};

export default func;
func.tags = ["strategy", "auto-approval"];