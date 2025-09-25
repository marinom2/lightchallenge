import { createPublicClient, http } from "viem"
import { ADDR, ABI } from "./contracts"

const rpc = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.lightchain.net"
const client = createPublicClient({ transport: http(rpc) })

export async function readChallenge(id: bigint) {
  return client.readContract({
    address: ADDR.ChallengePay,
    abi: ABI.ChallengePay,
    functionName: "getChallenge",
    args: [id],
  })
}
