import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const provider = new ethers.JsonRpcProvider(RPC);
const txHash = process.argv[2];

async function main() {
  if (!txHash) { console.log("Usage: npx tsx scripts/ops/decodeRevert.ts <txHash>"); return; }
  const tx = await provider.getTransaction(txHash);
  if (!tx) { console.log("tx not found"); return; }
  console.log("value:", ethers.formatEther(tx.value), "ETH");
  try {
    await provider.call({ to: tx.to ?? undefined, from: tx.from, data: tx.data, value: tx.value });
    console.log("replay: succeeded (state changed)");
  } catch(e: any) {
    console.log("revert data:", e.data);
    console.log("msg:", (e.message as string)?.slice(0, 800));
  }
}
main().catch(console.error);
