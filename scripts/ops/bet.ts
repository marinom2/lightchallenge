// scripts/bet.ts
import "@nomicfoundation/hardhat-ethers";
import hre from "hardhat";
const { ethers } = hre;
import { header, info, fail, context, toWei, NATIVE_SYMBOL } from "../dev/utils";

function parseOutcome(side: string): 1 | 2 {
  const s = (side ?? "").toLowerCase().trim();
  if (["success", "win", "pass"].includes(s)) return 1;
  if (["fail", "lose", "loss"].includes(s)) return 2;
  throw new Error(`SIDE must be one of: success|fail (got: ${side})`);
}

async function main() {
  header("Bet On Outcome");
  const { cp } = await context();

  const idStr = process.env.CH_ID ?? "";
  if (!/^[0-9]+$/.test(idStr)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(idStr);

  const side = process.env.SIDE ?? "";
  const outcome = parseOutcome(side);

  const amountWei = toWei(process.env.AMOUNT ?? "");
  if (amountWei <= 0n) throw new Error("AMOUNT must be > 0");

  // Expect Approved phase, before startTs (use chain time)
  const ch = await cp.getChallenge(id);
  if (Number(ch.status) !== 1) throw new Error("Challenge is not Approved");
  const latestBlock = await ethers.provider.getBlock("latest");
  const now = Number(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000));
  if (now >= Number(ch.startTs)) throw new Error("Bet window closed (>= startTs)");

  console.log(
    `betOn id=${idStr} side=${outcome === 1 ? "Success" : "Fail"} amount=${ethers.formatUnits(amountWei, 18)} ${NATIVE_SYMBOL}`
  );
  const tx = await cp.betOn(id, outcome, { value: amountWei });
  const rec = await tx.wait();
  info("Tx", tx.hash);
  info("Block", rec.blockNumber);

  const ch2 = await cp.getChallenge(id);
  console.log(
    `Pools now S/F: ${ethers.formatUnits(ch2.poolSuccess, 18)} / ${ethers.formatUnits(ch2.poolFail, 18)} ${NATIVE_SYMBOL}`
  );
}

main().catch(fail);