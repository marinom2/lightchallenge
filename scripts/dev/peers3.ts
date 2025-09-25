
import hre from "hardhat";
import "@nomicfoundation/hardhat-ethers";
import { parseEther } from "ethers";
import { readDeployments } from "./deployments";
import type { ChallengePay } from "../../typechain-types";

async function main() {
  const [owner, p1, p2, p3] = await hre.ethers.getSigners();

  const cpAddr = readDeployments().ChallengePay;
  if (!cpAddr) throw new Error("No ChallengePay in deployments/lightchain.json");

  const cp = (await hre.ethers.getContractAt(
    "ChallengePay",
    cpAddr,
    owner
  )) as unknown as ChallengePay;

  const id = BigInt(process.env.ID ?? "0");

  console.log(`Simulating peers on Challenge #${id}`);

  // joinChallenge adds to the Success pool
  await (await cp.connect(p1).joinChallenge(id, { value: parseEther("0.5") })).wait();
  await (await cp.connect(p2).joinChallenge(id, { value: parseEther("1.0") })).wait();

  // betOn: 1 = Success, 2 = Fail
  await (await cp.connect(p3).betOn(id, 2, { value: parseEther("0.8") })).wait();

  console.log("✅ peers3 complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
