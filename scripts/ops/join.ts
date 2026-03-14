// scripts/ops/join.ts
//
// Join the challenge success-side with a contribution (equivalent to "joinChallenge").
// This is separate from choosing a side via betOn(); join() always adds to success pool.
//
// Usage:
//   ADDR=<ChallengePay> CH_ID=<number> AMOUNT=<eth> \
//   npx hardhat run scripts/ops/join.ts --network <net>
import hre from "hardhat";
const { ethers, network } = hre;
import { context, header, info, fail, toWei, NATIVE_SYMBOL } from "../dev/utils";

async function main() {
  header("Join — Success Side");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const amountWei = toWei(process.env.AMOUNT ?? "");
  if (amountWei <= 0n) throw new Error("AMOUNT must be > 0");

  const me = await signer.getAddress();
  info("Network", net || network.name);
  info("Sender", me);
  info("Contract", addr);
  info("Challenge", id.toString());

  const ch = await cp.getChallenge(id);
  if (Number(ch.status) !== 0) throw new Error("Challenge is not Active");
  const latest = await ethers.provider.getBlock("latest");
  const now = Number(latest?.timestamp ?? Math.floor(Date.now() / 1000));
  if (now >= Number(ch.startTs)) throw new Error("Join window closed (>= startTs)");

  const tx = await cp.joinChallenge(id, { value: amountWei });
  console.log("Tx:", tx.hash);
  const rec = await tx.wait();
  console.log("Included in block:", rec.blockNumber);

  const ch2 = await cp.getChallenge(id);
  console.log(
    `Pools now S/F: ${ethers.formatUnits(ch2.poolSuccess, 18)} / ${ethers.formatUnits(ch2.poolFail, 18)} ${NATIVE_SYMBOL}`
  );
  console.log("\n✅ Joined success-side.");
}

main().catch(fail);