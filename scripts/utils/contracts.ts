// scripts/util/contracts.ts
import { ethers } from "hardhat"
import type { ChallengePay, Treasury, PlonkVerifier, ZkProofVerifier } from "../../typechain-types"

export async function getChallengePay(addr: string) {
  return ethers.getContractAt("ChallengePay", addr) as Promise<ChallengePay>
}

export async function getTreasury(addr: string) {
  return ethers.getContractAt("Treasury", addr) as Promise<Treasury>
}

export async function getPlonkVerifier(addr: string) {
  return ethers.getContractAt("PlonkVerifier", addr) as Promise<PlonkVerifier>
}

export async function getZkProofVerifier(addr: string) {
  return ethers.getContractAt("ZkProofVerifier", addr) as Promise<ZkProofVerifier>
}