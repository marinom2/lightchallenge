// webapp/lib/contracts.ts
import type { Abi, Address } from "viem"
import { isAddress } from "viem"
import { EXPLORER_URL } from "./lightchain"

import deploymentsJson from "../public/deployments/lightchain.json"
import challengeAbiMaybe from "../public/abi/ChallengePay.abi.json"

// Try to load optional verifiers
let zkAbiMaybe: any = null
let plonkAbiMaybe: any = null
let aivmAbiMaybe: any = null
try { zkAbiMaybe = require("../public/abi/ZkProofVerifier.abi.json") } catch {}
try { plonkAbiMaybe = require("../public/abi/PlonkVerifier.abi.json") } catch {}
try { aivmAbiMaybe = require("../public/abi/AivmProofVerifier.abi.json") } catch {}

export type Deployments = {
  chainId: number
  rpcUrl?: string
  contracts: {
    ChallengePay: string
    Treasury?: string
    DaoTreasury?: string
    ZkProofVerifier?: string
    PlonkVerifier?: string
    AivmProofVerifier?: string
    MultiSigProofVerifier?: string // future subjective proof
  }
}

function extractAbi(maybe: unknown | null): Abi | undefined {
  if (!maybe) return undefined
  if (typeof maybe === "object" && maybe && "abi" in (maybe as any)) {
    return (maybe as any).abi as Abi
  }
  return maybe as unknown as Abi
}

const deployments = deploymentsJson as Deployments
const { contracts } = deployments

const treasuryAddr =
  contracts.Treasury ??
  contracts.DaoTreasury ??
  undefined

export const ADDR = {
  ChallengePay: contracts.ChallengePay as Address,
  Treasury: treasuryAddr as Address | undefined,
  ZkProofVerifier: contracts.ZkProofVerifier as Address | undefined,
  PlonkVerifier: contracts.PlonkVerifier as Address | undefined,
  AivmProofVerifier: contracts.AivmProofVerifier as Address | undefined,
  MultiSigProofVerifier: contracts.MultiSigProofVerifier as Address | undefined,
} as const

for (const [k, v] of Object.entries(ADDR)) {
  if (!v) continue
  if (!isAddress(v)) throw new Error(`Invalid address in deployments for ${k}: ${v}`)
}

export const ABI = {
  ChallengePay: extractAbi(challengeAbiMaybe)!,
  ZkProofVerifier: extractAbi(zkAbiMaybe),
  PlonkVerifier: extractAbi(plonkAbiMaybe),
  AivmProofVerifier: extractAbi(aivmAbiMaybe),
} as const

export { EXPLORER_URL }
export { lightchain, RPC_URL } from "./lightchain"