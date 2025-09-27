import { publicClient } from "@/lib/viem"
import { ADDR, ABI } from "@/lib/contracts"
import { createPublicClient, http, Hex, GetLogsReturnType } from "viem"
import { lightchain } from "@/lib/lightchain"

type ChallengeCreatedLog = {
  args: {
    id: bigint
    creator: `0x${string}`
    stake: bigint
  }
  blockNumber: bigint
  transactionHash: Hex
}

const MAX_SPAN = 10_000n
const MAX_RETRIES = 4

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function getChallengeCreatedLogs(from: bigint, to: bigint) {
  const client =
    publicClient ??
    createPublicClient({
      chain: lightchain,
      transport: http(lightchain.rpcUrls.default.http[0]!),
    })

  const logs: ChallengeCreatedLog[] = []
  let start = from

  while (start <= to) {
    const end = start + MAX_SPAN - 1n > to ? to : start + MAX_SPAN - 1n
    let attempt = 0
    // retry with exponential backoff
    for (;;) {
      try {
        const chunk = (await client.getLogs({
          address: ADDR.ChallengePay,
          event: {
            type: "event",
            name: "ChallengeCreated",
            inputs: [
              { indexed: true, name: "id", type: "uint256" },
              { indexed: true, name: "creator", type: "address" },
              { indexed: false, name: "stake", type: "uint256" },
            ],
          } as any,
          fromBlock: start,
          toBlock: end,
        })) as GetLogsReturnType

        for (const l of chunk) {
          logs.push({
            // @ts-ignore viem typed args
            args: l.args,
            blockNumber: l.blockNumber!,
            transactionHash: l.transactionHash!,
          })
        }
        break
      } catch (err) {
        if (attempt++ >= MAX_RETRIES) throw err
        await sleep(300 * attempt) // backoff
      }
    }
    start = end + 1n
  }

  return logs.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1))
}