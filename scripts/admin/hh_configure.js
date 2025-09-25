const { ethers, network } = require("hardhat");
async function main() {
  const net = process.env.HARDHAT_NETWORK || network.name;
  const dep = require(`../../deployments/${net}.json`);
  const cpAddr = process.env.CP_ADDR || dep.ChallengePay;
  const zkAddr = process.env.ZK_ADDR || dep.zkProofVerifier;
  const chId = BigInt(process.env.CH_ID || "1");

  if (!cpAddr || !zkAddr) throw new Error("Missing CP_ADDR / ZK_ADDR");

  const cp = await ethers.getContractAt("ChallengePay", cpAddr);
  console.log("setProofConfig(chId=", chId.toString(), ", required=true, verifier=", zkAddr, ")");
  const tx = await cp.setProofConfig(chId, true, zkAddr);
  console.log("tx:", tx.hash);
  await tx.wait();

  // Best-effort decode from getChallenge tuple (indexes may vary by build)
  const ch = await cp.getChallenge(chId);
  const vGuess = ch[24] || "0x";
  const rGuess = ch[23];
  console.log("Heuristic read-back → verifier:", vGuess, " required:", rGuess);
}
main().catch((e)=>{ console.error(e); process.exit(1); });
