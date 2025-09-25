import "@nomicfoundation/hardhat-ethers";
import hardhat from "hardhat";
const { ethers } = hardhat;

async function main() {
  const net = (process.env.HARDHAT_NETWORK || "lightchain");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dep = require(`../deployments/${net}.json`);
  const cp = await ethers.getContractAt("ChallengePay", dep.ChallengePay);

  const minStakeWei = ethers.parseEther(process.env.MIN_STAKE || "0.00005");
  const thresholdBps = Number(process.env.THRESHOLD_BPS || 5000);
  const quorumBps    = Number(process.env.QUORUM_BPS || 300);
  const cooldownSec  = Number(process.env.COOLDOWN_SEC || (3*24*3600));

  const tx = await cp.setValidatorParams(minStakeWei, thresholdBps, quorumBps, cooldownSec);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("✔ setValidatorParams done");
}

main().catch((e) => { console.error(e); process.exit(1); });