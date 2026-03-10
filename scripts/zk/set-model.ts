import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const zkAddr = process.env.ZK_VERIFIER
  const modelHash = process.env.MODEL_HASH // bytes32
  const plonkAddr = process.env.PlonkVerifier || process.env.PLONK_VERIFIER
  const enforce = (process.env.ENFORCE_BINDING ?? "true").toLowerCase() === "true"

  if (!zkAddr) throw new Error("Set ZK_VERIFIER")
  if (!modelHash) throw new Error("Set MODEL_HASH (0x...)")
  if (!plonkAddr) throw new Error("Set PLONK_VERIFIER")

  const [signer] = await ethers.getSigners()
  const zk = await ethers.getContractAt("ZkProofVerifier", zkAddr, signer)
  const tx = await zk.setModel(modelHash as `0x${string}`, plonkAddr, true, enforce)
  console.log("tx:", tx.hash)
  await tx.wait()
  console.log("✓ model registered", { modelHash, plonkAddr, enforce })
}

main().catch((e) => { console.error(e); process.exit(1) })