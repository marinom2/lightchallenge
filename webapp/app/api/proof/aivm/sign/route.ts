import { NextResponse } from "next/server"
import { privateKeyToAccount } from "viem/accounts"
import { createWalletClient, http, Hex, encodeAbiParameters, keccak256 } from "viem"
import { lightchain } from "@/lib/lightchain"
import ratelimit from "@/lib/server/ratelimit"

export const runtime = "nodejs"

export async function POST(req: Request) {
  // Tiny in-memory rate limit (per instance)
  const limited = ratelimit("aivm-sign", 10, 60_000) // 10 req/min per instance
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Bad JSON" }, { status: 400 })

  const { user, challengeId, modelId, modelVersion, payload } = body as {
    user: `0x${string}`
    challengeId: string | number
    modelId: Hex
    modelVersion: number
    payload: Hex // raw bytes hex
  }

  const pk = process.env.AIVM_SIGNER_KEY
  if (!pk) {
    return NextResponse.json({ error: "Signer not configured" }, { status: 403 })
  }

  const account = privateKeyToAccount(pk as Hex)
  const wallet = createWalletClient({ account, chain: lightchain, transport: http(lightchain.rpcUrls.default.http[0]!) })

  // Mirror Solidity struct: (user, challengeId, modelId, modelVersion, keccak256(payload))
  const structEncoded = encodeAbiParameters(
    [
      { name: "user", type: "address" },
      { name: "challengeId", type: "uint256" },
      { name: "modelId", type: "bytes32" },
      { name: "modelVersion", type: "uint256" },
      { name: "payloadHash", type: "bytes32" },
    ],
    [user, BigInt(challengeId), modelId, BigInt(modelVersion), keccak256(payload as Hex)],
  )

  // EIP-191 personal sign is ok for demo; upgrade to EIP-712 if you expose typed data
  const sig = await wallet.signMessage({ message: { raw: structEncoded } })

  return NextResponse.json({
    signer: account.address,
    signature: sig,
  })
}