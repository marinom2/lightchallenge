import dep from "../public/deployments/lightchain.json"
import cpAbi from "../public/abi/ChallengePay.abi.json"
import zkAbi from "../public/abi/ZkProofVerifier.abi.json"

export const ADDR = {
  ChallengePay: dep.ChallengePay as `0x${string}`,
  ZkProofVerifier: dep.ZkProofVerifier as `0x${string}`,
  PlonkVerifier: dep.PlonkVerifier as `0x${string}`,
  DaoTreasury: dep.DaoTreasury as `0x${string}`,
} as const

export const ABI = {
  ChallengePay: (cpAbi as any).abi,
  ZkProofVerifier: (zkAbi as any).abi,
} as const
