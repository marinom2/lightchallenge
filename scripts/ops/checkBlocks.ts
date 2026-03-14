import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "webapp/.env.local") });

const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
const provider = new ethers.JsonRpcProvider(RPC);

async function main() {
  for (const bn of [1703360, 1703361, 1703362, 1703363, 1703364, 1703365]) {
    const b = await provider.getBlock(bn);
    if (b) {
      const d = new Date(Number(b.timestamp) * 1000);
      console.log(`Block ${bn}: timestamp=${b.timestamp} = ${d.toISOString()}`);
    }
  }
}
main().catch(console.error);
