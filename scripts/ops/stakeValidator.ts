// scripts/ops/stakeValidator.ts
//
// Add validator stake (msg.value). Shows min stake and your post-stake total.
//
// Usage:
//   ADDR=<ChallengePay> AMOUNT=<eth> \
//   npx hardhat run scripts/ops/stakeValidator.ts --network <net>
import hre from "hardhat";
const { ethers, network } = hre;
import { context, header, info, fail, toWei, NATIVE_SYMBOL } from "../dev/utils";

async function main() {
  header("Validator — Stake");
  const { cp, addr, net, signer } = await context();

  const amountWei = toWei(process.env.AMOUNT ?? "");
  if (amountWei <= 0n) throw new Error("AMOUNT must be > 0");

  const me = await signer.getAddress();

  info("Network", net || network.name);
  info("Validator", me);
  info("Contract", addr);

  const minStake = await cp.minValidatorStake();
  const cur = await cp.validatorStake(me);
  console.log("Current stake:", ethers.formatUnits(cur, 18), NATIVE_SYMBOL);
  console.log("Min stake    :", ethers.formatUnits(minStake, 18), NATIVE_SYMBOL);

  const tx = await cp.stakeValidator({ value: amountWei });
  console.log("Tx:", tx.hash);
  const rec = await tx.wait();
  console.log("Included in block:", rec.blockNumber);

  const after = await cp.validatorStake(me);
  console.log("New stake:", ethers.formatUnits(after, 18), NATIVE_SYMBOL);
  console.log("\n✅ Stake added.");
}

main().catch(fail);