// scripts/admin/setDaoTreasury.ts
import { ethers } from "hardhat";
import { loadDeps, saveDeps, requireAddr, isAddr } from "../shared/deployments";

async function main() {
  const dep = loadDeps();

  // prefer env, else use current dep value
  const targetRaw =
    process.env.TREASURY ||
    process.env.ADMIN_ADDRESS ||
    dep.daoTreasury;

  if (!isAddr(targetRaw)) {
    throw new Error("Set TREASURY (or ADMIN_ADDRESS) to a valid 0x address in .env or ensure it exists in deployments");
  }

  const target = targetRaw as `0x${string}`;

  if (dep.daoTreasury?.toLowerCase() === target.toLowerCase()) {
    console.log(`• daoTreasury already set to ${target} — skipping`);
    return;
  }

  const cpAddr = requireAddr(dep, "ChallengePay");
  const cp = await ethers.getContractAt("ChallengePay", cpAddr);

  // dry-run support
  if (process.env.DRY_RUN === "1") {
    console.log(`(dry-run) would call setDaoTreasury(${target}) on ${cpAddr}`);
    return;
  }

  const tx = await cp.setDaoTreasury(target);
  console.log(`• setDaoTreasury(${target}) → ${tx.hash}`);
  await tx.wait();

  dep.daoTreasury = target;
  saveDeps(dep);
  console.log("✅ daoTreasury updated & saved");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});