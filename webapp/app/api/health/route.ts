import { NextResponse } from "next/server";
import { getPool } from "../../../../offchain/db/pool";

export const revalidate = 10;
export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.LCAI_RPC ||
  "https://light-testnet-rpc.lightchain.ai";

export async function GET() {
  let rpc = false;
  let db = false;
  let blockNumber = "0x0";
  let blockAge = -1;

  // Check RPC
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data?.result) {
      rpc = true;
      blockNumber = data.result;

      // Get block timestamp to calculate age
      const blockRes = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBlockByNumber",
          params: [data.result, false],
          id: 2,
        }),
        signal: AbortSignal.timeout(5000),
      });
      const blockData = await blockRes.json();
      if (blockData?.result?.timestamp) {
        const blockTs = parseInt(blockData.result.timestamp, 16);
        blockAge = Math.floor(Date.now() / 1000) - blockTs;
      }
    }
  } catch {
    rpc = false;
  }

  // Check DB
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    db = true;
  } catch {
    db = false;
  }

  // Determine status
  let status: "healthy" | "degraded" | "down" = "down";
  if (rpc && db && blockAge >= 0 && blockAge < 300) {
    status = "healthy";
  } else if (rpc || db) {
    status = "degraded";
  }

  return NextResponse.json({
    status,
    rpc,
    db,
    blockNumber,
    blockAge,
    timestamp: Math.floor(Date.now() / 1000),
  });
}
