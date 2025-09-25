const { ethers, network } = require("hardhat");
async function main(){
  const net = process.env.HARDHAT_NETWORK || network.name;
  const dep = require(`../../deployments/${net}.json`);
  const zkAddr = process.env.ZK_ADDR || dep.zkProofVerifier;
  const label = process.env.LABEL || "steps-circuit@1.0.0";
  const zk = await ethers.getContractAt("ZkProofVerifier", zkAddr);
  const modelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
  const m = await zk.models(modelHash);
  console.log("Label:", label);
  console.log("ModelHash:", modelHash);
  console.log({ verifier: m[0], active: m[2], enforce: m[3] });
}
main().catch((e)=>{ console.error(e); process.exit(1); });
