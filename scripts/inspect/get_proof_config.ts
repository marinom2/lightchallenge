import { ethers } from "hardhat";
import fs from "fs";

async function main() {
  const net = process.env.HARDHAT_NETWORK || "lightchain";
  const depPath = `deployments/${net}.json`;
  const chIdStr = process.env.CH_ID || "1";
  const chId = BigInt(chIdStr);

  if (!fs.existsSync(depPath)) throw new Error(`deployments file not found: ${depPath}`);
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));

  const cp = await ethers.getContractAt("ChallengePay", dep.ChallengePay);
  const t: any = await cp.getChallenge(chId);

  const required = !!t[23];
  const verifier = t[24];

  console.log(JSON.stringify({ network: net, chId: chId.toString(), required, verifier }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
