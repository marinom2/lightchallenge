import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ethers";
// scripts/dev/warp.ts
import hardhat from "hardhat";
const { ethers } = hardhat;

/**
 * Usage:
 *   SECS=300 npx hardhat run scripts/dev/warp.ts --network localhost
 *   TO_TS=1757800000 npx hardhat run scripts/dev/warp.ts --network localhost
 *
 * If TO_TS is set (unix seconds), we warp to that timestamp (or to now+1 if <= now).
 * Otherwise, we increase by SECS (default 1s).
 */
async function main() {
  const secsEnv = process.env.SECS;
  const toTsEnv = process.env.TO_TS;

  const latest = await ethers.provider.getBlock("latest");
  if (!latest) throw new Error("Cannot read latest block");
  const now = Number(latest.timestamp);

  let inc = 1;
  if (toTsEnv) {
    const target = Number(toTsEnv);
    if (!Number.isFinite(target)) throw new Error("TO_TS must be unix seconds");
    inc = Math.max(1, target - now);
    console.log(`⏩ Warping to absolute ${target} (now=${now}, +${inc}s)…`);
  } else {
    inc = Number(secsEnv ?? "1");
    if (!Number.isFinite(inc) || inc < 1) inc = 1;
    console.log(`⏩ Increasing time by ${inc}s…`);
  }

  // Hardhat JSON-RPC helpers
  await ethers.provider.send("evm_increaseTime", [inc]);
  await ethers.provider.send("evm_mine", []);
  const latest2 = await ethers.provider.getBlock("latest");
  console.log(`✅ New chain time: ${latest2?.timestamp} (${new Date(Number(latest2?.timestamp) * 1000).toISOString()})`);
}

main().catch((e) => { console.error(e); process.exit(1); });