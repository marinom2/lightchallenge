// webapp/lib/contracts.ts
import { isAddress, getAddress } from "viem"

// Single source of truth: public/deployments + public/abi
import dep from "../public/deployments/lightchain.json"
import cp from "../public/abi/ChallengePay.abi.json"
import zk from "../public/abi/ZkProofVerifier.abi.json"

type HexAddr = `0x${string}`

function readAddr(obj: any, keys: string[], label: string): HexAddr {
  const raw =
    keys.map((k) => obj?.[k]).find((v) => typeof v === "string" && v.startsWith("0x"))
  if (!raw || !isAddress(raw)) {
    throw new Error(
      `Invalid ${label} in deployments JSON: ${JSON.stringify(raw)}.\n` +
      `Please set a real checksummed address for ${label}.`
    )
  }
  return getAddress(raw) as HexAddr // normalize checksum
}

// Support PascalCase or camelCase keys
const ChallengePay  = readAddr(dep, ["ChallengePay", "challengePay"], "ChallengePay")
const DaoTreasury   = readAddr(dep, ["DaoTreasury", "daoTreasury"], "DaoTreasury")
const ZkProofVerifier = readAddr(dep, ["ZkProofVerifier", "zkProofVerifier"], "ZkProofVerifier")
const PlonkVerifier = readAddr(dep, ["PlonkVerifier", "plonkVerifier"], "PlonkVerifier")

export const ADDR = {
  ChallengePay,
  DaoTreasury,
  ZkProofVerifier,
  PlonkVerifier,
} as const

// Some compilers emit `{ abi: [...] }`, others just `[...]`
const pickAbi = (x: any) => (Array.isArray(x) ? x : x?.abi)
export const ABI = {
  ChallengePay: pickAbi(cp),
  ZkProofVerifier: pickAbi(zk),
} as const