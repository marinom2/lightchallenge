// scripts/events/backfill.ts
// Backfills ChallengePay events into a JSONL file with pagination.
// Usage:
//   npx ts-node scripts/events/backfill.ts [--to <block>] [--span 10000] [--out snapshots/challengepay_events.jsonl]

import {
    createPublicClient,
    http,
    decodeEventLog,
    type Abi,
    type Address,
  } from "viem"
  import {
    existsSync,
    mkdirSync,
    writeFileSync,
    appendFileSync,
    readFileSync,
  } from "fs"
  import { join, dirname } from "path"
  
  // ---------- CLI args ----------
  function getArgValue(flag: string): string | undefined {
    const ix = process.argv.indexOf(flag)
    if (ix === -1) return undefined
    const val = process.argv[ix + 1]
    if (!val || val.startsWith("--")) return undefined
    return val
  }
  
  const toArg = getArgValue("--to")
  const spanArg = getArgValue("--span")
  const outArg = getArgValue("--out")
  
  // ---------- Paths & constants ----------
  const ROOT = process.cwd()
  const WEBAPP_DIR = join(ROOT, "webapp")
  const DEPLOY_FILE = join(WEBAPP_DIR, "public", "deployments", "lightchain.json")
  const ABI_FILE = join(WEBAPP_DIR, "public", "abi", "ChallengePay.abi.json")
  
  const OUT_DIR_DEFAULT = join(ROOT, "snapshots")
  const OUT_FILE_DEFAULT = join(OUT_DIR_DEFAULT, "challengepay_events.jsonl")
  
  const OUT_FILE = outArg ?? OUT_FILE_DEFAULT
  const OUT_DIR = dirname(OUT_FILE) // parent dir
  
  // ---------- Runtime I/O (no JSON imports) ----------
  if (!existsSync(DEPLOY_FILE)) {
    console.error(`Deployments file not found: ${DEPLOY_FILE}`)
    process.exit(1)
  }
  const deploymentsRaw = JSON.parse(readFileSync(DEPLOY_FILE, "utf8")) as {
    chainId?: number
    rpcUrl?: string
    contracts?: Record<string, string | undefined>
  }
  
  if (!existsSync(ABI_FILE)) {
    console.error(`ABI file not found: ${ABI_FILE}`)
    process.exit(1)
  }
  
  // Handle ABI format safely
  type AbiContainer = { abi?: unknown }
  const abiJsonRaw = JSON.parse(readFileSync(ABI_FILE, "utf8")) as Abi | AbiContainer
  let abi: Abi
  if (Array.isArray(abiJsonRaw)) {
    // raw ABI array
    abi = abiJsonRaw as Abi
  } else if ("abi" in abiJsonRaw && Array.isArray((abiJsonRaw as AbiContainer).abi)) {
    abi = (abiJsonRaw as AbiContainer).abi as Abi
  } else {
    throw new Error(`Invalid ABI file format at ${ABI_FILE}`)
  }
  
  const address = (deploymentsRaw.contracts?.ChallengePay ?? "") as Address
  if (!address) {
    console.error("ChallengePay address missing in deployments file.")
    process.exit(1)
  }
  
  const RPC =
    process.env.LIGHTCHAIN_RPC ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    deploymentsRaw.rpcUrl ||
    "https://light-testnet-rpc.lightchain.ai"
  
  // viem client (no chain metadata needed for simple getLogs)
  const client = createPublicClient({ transport: http(RPC) })
  
  // ---------- Numbers ----------
  const SPAN = spanArg ? BigInt(spanArg) : 10_000n
  
  async function main() {
    // Ensure output dir/file
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
    if (!existsSync(OUT_FILE)) writeFileSync(OUT_FILE, "")
  
    const latest = await client.getBlockNumber()
    const toBlock = toArg ? BigInt(toArg) : latest
  
    console.log(`Backfill logs for ChallengePay ${address}`)
    console.log(`→ RPC: ${RPC}`)
    console.log(`→ range: [0 .. ${toBlock}] with span ${SPAN}`)
    console.log(`→ out: ${OUT_FILE}`)
  
    let from = 0n
    while (from <= toBlock) {
      const to = from + SPAN > toBlock ? toBlock : from + SPAN
  
      const logs = await client.getLogs({ address, fromBlock: from, toBlock: to })
  
      for (const l of logs) {
        try {
          const dec = decodeEventLog({ abi, data: l.data, topics: l.topics })
          appendFileSync(
            OUT_FILE,
            JSON.stringify(
              {
                blockNumber: l.blockNumber?.toString(),
                txHash: l.transactionHash,
                event: dec.eventName,
                args: dec.args,
              }
            ) + "\n"
          )
        } catch {
          appendFileSync(
            OUT_FILE,
            JSON.stringify(
              {
                blockNumber: l.blockNumber?.toString(),
                txHash: l.transactionHash,
                event: "UNKNOWN",
                data: l.data,
                topics: l.topics,
              }
            ) + "\n"
          )
        }
      }
  
      console.log(`✓ ${from}..${to} (${logs.length} logs)`)
      from = to + 1n
    }
  
    console.log("✓ Done:", OUT_FILE)
  }
  
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })