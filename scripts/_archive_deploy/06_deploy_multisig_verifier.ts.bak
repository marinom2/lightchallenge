import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 MultiSigProofVerifier: network=${network.name} deployer=${deployer}`);

  const owner = process.env.MULTISIG_OWNER || deployer;

  const attesters = (process.env.MULTISIG_ATTESTERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const threshold = Number(process.env.MULTISIG_THRESHOLD ?? (attesters.length > 0 ? 1 : 0));
  if (attesters.length > 256) throw new Error("MULTISIG_ATTESTERS > 256 not supported");
  if (threshold === 0) log("WARN: MULTISIG_THRESHOLD=0 (no signatures required?)");

  const existing = await getOrNull("MultiSigProofVerifier");
  if (!existing) {
    const d = await deploy("MultiSigProofVerifier", {
      from: deployer,
      args: [owner, attesters, threshold],
      log: true,
      waitConfirmations: 1,
    });
    log(`✓ Deployed MultiSigProofVerifier @ ${d.address}`);
  } else {
    log(`✓ Reusing MultiSigProofVerifier @ ${existing.address}`);
  }

  const dep = await get("MultiSigProofVerifier");

  await writeAbi(hre, "MultiSigProofVerifier", "MultiSigProofVerifier.abi.json");
  await mergeDeployments(hre, { MultiSigProofVerifier: dep.address });
};

export default func;
func.tags = ["attest", "multisig"];