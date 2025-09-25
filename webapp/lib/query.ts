import { http, createPublicClient } from "viem"
import { defineChain } from "viem"
import { ABI, ADDR } from "./contracts"

const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.lightchain.net"

export const lightchain = defineChain({
  id: 504,
  name: "Lightchain Testnet",
  nativeCurrency: { name: "LCAI", symbol: "LCAI", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})

const pub = createPublicClient({ chain: lightchain, transport: http(rpc) })

export async function totalChallenges(): Promise<bigint | undefined> {
  try {
    return await pub.readContract({
      address: ADDR.ChallengePay,
      abi: ABI.ChallengePay,
      functionName: "totalChallenges",
      args: [],
    }) as any
  } catch {
    return undefined
  }
}

export async function getChallenge(id: bigint): Promise<any> {
  return await pub.readContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "getChallenge",
    args: [id],
  })
}

export async function getSnapshot(id: bigint): Promise<any> {
  return await pub.readContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "getSnapshot",
    args: [id],
  })
}

// naive list of open/active
export async function listOpen(limit = 30): Promise<{ id: bigint; v: any }[]> {
  const N = (await totalChallenges()) ?? 100n
  const out: { id: bigint; v: any }[] = []
  for (let i = 1n; i <= N && out.length < limit; i++) {
    try {
      const v = await getChallenge(i)
      // assuming status <= 2 means pending/active, adjust if your enum differs
      if ((v as any)?.status <= 2) out.push({ id: i, v })
    } catch { /* ignore gaps */ }
  }
  return out
}