import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const provider = new ethers.JsonRpcProvider(RPC);
const txHash = process.argv[2];

async function main() {
  if (!txHash) { console.log("Usage: npx tsx scripts/ops/decodeRevertAtBlock.ts <txHash>"); return; }
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) { console.log("receipt not found"); return; }
  const tx = await provider.getTransaction(txHash);
  if (!tx) { console.log("tx not found"); return; }
  
  console.log("blockNumber:", receipt.blockNumber, "status:", receipt.status);
  
  try {
    const result = await provider.call({
      to: tx.to ?? undefined,
      from: tx.from,
      data: tx.data,
      value: tx.value,
    }, receipt.blockNumber - 1);
    console.log("replay at block-1: succeeded ->", result);
  } catch(e: any) {
    console.log("revert at block-1 data:", e.data);
    console.log("msg:", (e.message as string)?.slice(0, 500));
  }
}
main().catch(console.error);
