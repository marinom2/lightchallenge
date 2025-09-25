// scripts/helpers.ts
import { ethers } from "hardhat"
import type { ChallengePay } from "../typechain-types"

export async function getSigner() {
  const [signer] = await ethers.getSigners()
  if (!signer) throw new Error("No signer. Check PRIVATE_KEY / accounts.")
  return signer
}

export async function getChallengePay(): Promise<ChallengePay> {
  const addr = process.env.CHALLENGEPAY_ADDR?.trim()
  if (!addr) throw new Error("Set CHALLENGEPAY_ADDR in .env")
  return (await ethers.getContractAt("ChallengePay", addr)) as ChallengePay
}

export function now(): number {
  return Math.floor(Date.now() / 1000)
}