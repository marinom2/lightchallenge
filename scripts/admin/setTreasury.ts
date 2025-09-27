// scripts/admin/setTreasury.ts
import { ethers } from "hardhat"

async function main() {
  const challengeAddr = process.env.CHALLENGEPAY as `0x${string}`
  const treasuryAddr  = process.env.TREASURY as `0x${string}`
  if (!challengeAddr) throw new Error("Set CHALLENGEPAY=0x...")
  if (!treasuryAddr) throw new Error("Set TREASURY=0x...")

  const [signer] = await ethers.getSigners()
  const cp = await ethers.getContractAt("ChallengePay", challengeAddr, signer)

  const tx = await cp.setDaoTreasury(treasuryAddr)
  console.log("setDaoTreasury tx:", tx.hash)
  await tx.wait()
  console.log("✓ ChallengePay.treasury set ->", treasuryAddr)
}

main().catch((e) => { console.error(e); process.exit(1) })