// scripts/ops/rpcHealth.ts
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const url = process.env.LIGHTCHAIN_RPC;
  if (!url) {
    console.error("❌ LIGHTCHAIN_RPC is not set in .env");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(url);

  // Basic calls
  const [network, block] = await Promise.all([
    provider.getNetwork(),
    provider.getBlock("latest"),
  ]);

  // Node client version
  const clientVersion = await provider.send("web3_clientVersion", []);

  const now = Math.floor(Date.now() / 1000);
  const lag = block?.timestamp ? now - Number(block.timestamp) : NaN;

  console.log("\n================ RPC HEALTH ================\n");
  console.log(`RPC URL          : ${url}`);
  console.log(`Client           : ${clientVersion}`);
  console.log(`Chain ID         : ${network.chainId.toString()}`);
  console.log(`Latest block     : ${block?.number}`);
  console.log(
    `Block ts (ISO)   : ${
      block ? new Date(block.timestamp * 1000).toISOString() : "(n/a)"
    }`
  );
  console.log(`Now (ISO)        : ${new Date(now * 1000).toISOString()}`);
  console.log(`Lag (sec)        : ${isNaN(lag) ? "(n/a)" : lag}`);
  console.log("\n===========================================\n");

  if (!isNaN(lag) && lag > 180) {
    console.warn("⚠️  Node appears to be >3 minutes behind. It may not be fully synced.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});