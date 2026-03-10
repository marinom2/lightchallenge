import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const url = process.env.LIGHTCHAIN_RPC || process.env.NEXT_PUBLIC_RPC_URL || "https://light-testnet-rpc.lightchain.ai";
  console.log("\n================ RPC HEALTH ================\n");
  console.log(`RPC URL          : ${url}`);

  // Raw fetch probe with short timeout
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "web3_clientVersion", params: [] }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = await res.text();
    console.log(`HTTP probe       : ${res.status} ${res.statusText}`);
    console.log(`Response (trunc) : ${text.slice(0, 120)}`);
  } catch (e: any) {
    console.log(`HTTP probe error : ${e?.name || ""} ${e?.message || e}`);
  }

  // Ethers JSON-RPC
  try {
    const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: null });
    const [network, block, clientVersion] = await Promise.all([
      provider.getNetwork(),
      provider.getBlock("latest"),
      provider.send("web3_clientVersion", []),
    ]);
    const now = Math.floor(Date.now() / 1000);
    const lag = block?.timestamp ? now - Number(block.timestamp) : NaN;

    console.log(`Client           : ${clientVersion}`);
    console.log(`Chain ID         : ${network.chainId.toString()}`);
    console.log(`Latest block     : ${block?.number}`);
    console.log(`Block ts (ISO)   : ${block ? new Date(block.timestamp * 1000).toISOString() : "(n/a)"}`);
    console.log(`Now (ISO)        : ${new Date(now * 1000).toISOString()}`);
    console.log(`Lag (sec)        : ${isNaN(lag) ? "(n/a)" : lag}`);
  } catch (e: any) {
    console.log("Ethers error     :", e?.code || "", e?.shortMessage || e?.message || e);
  }

  console.log("\n===========================================\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});