import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";
import { mergeDeployments, writeAbi } from "../scripts/deploy-utils/_shared";

const ADAPTER_NAME = "PlonkProofVerifierAdapter"; 

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts, network, artifacts } = hre;
  const { deploy, getOrNull, get, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log(`\n🚀 ${ADAPTER_NAME}: network=${network.name} deployer=${deployer}`);

  const existing = await getOrNull(ADAPTER_NAME);
  if (existing) {
    log(`✓ Reusing ${ADAPTER_NAME} @ ${existing.address}`);
    await writeAbi(hre, ADAPTER_NAME, `${ADAPTER_NAME}.abi.json`);
    await mergeDeployments(hre, { PlonkProofVerifierAdapter: existing.address });
    return;
  }

  const art = await artifacts.readArtifact(ADAPTER_NAME);
  const ctor = art.abi.find((x: any) => x.type === "constructor");
  const inputs = ctor?.inputs?.length ?? 0;

  let args: any[] = [];
  if (inputs === 1) {
    const plonk = await get("PlonkVerifier");
    args = [plonk.address];
  } else if (inputs > 1) {
    throw new Error(`${ADAPTER_NAME} constructor has ${inputs} args; update deploy script args mapping.`);
  }

  const d = await deploy(ADAPTER_NAME, {
    from: deployer,
    args,
    log: true,
    waitConfirmations: 1,
  });

  log(`✓ Deployed ${ADAPTER_NAME} @ ${d.address} (args=${JSON.stringify(args)})`);

  await writeAbi(hre, ADAPTER_NAME, `${ADAPTER_NAME}.abi.json`);
  await mergeDeployments(hre, { PlonkProofVerifierAdapter: d.address });
};

export default func;
func.tags = ["PLONK"];
func.dependencies = ["zk", "plonk"];