// scripts/dev/findSpends.ts
import "dotenv/config";
import { ethers } from "ethers";

function toHexNoPad(n: number | bigint) {
  return "0x" + BigInt(n).toString(16);
}

async function getBlockWithTxs(provider: ethers.JsonRpcProvider, n: number) {
  return provider.send("eth_getBlockByNumber", [toHexNoPad(n), true]);
}

async function main() {
  const RPC = process.env.LIGHTCHAIN_RPC || "";
  const ADDR = (process.env.ADDR || "").toLowerCase();
  const LOOKBACK = Number(process.env.LOOKBACK || "6000");

  if (!RPC) throw new Error("Set LIGHTCHAIN_RPC");
  if (!ADDR) throw new Error("Set ADDR=0x...");

  const provider = new ethers.JsonRpcProvider(RPC);
  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - LOOKBACK);

  let outValue = 0n, outFee = 0n, inValue = 0n, countOut = 0, countIn = 0;

  console.log(`Scanning blocks [${from}..${latest}] for ${ADDR} ...`);
  for (let b = latest; b >= from; b--) {
    const blk: any = await getBlockWithTxs(provider, b);
    if (!blk || !blk.transactions) continue;

    for (const tx of blk.transactions) {
      const fromAddr = (tx.from || "").toLowerCase();
      const toAddr   = (tx.to   || "").toLowerCase();
      const value    = BigInt(tx.value || "0x0");

      if (fromAddr === ADDR) {
        const rec = await provider.getTransactionReceipt(tx.hash);
        const gasUsed = BigInt(rec?.gasUsed ?? 0);

        // Prefer EIP-1559 maxFeePerGas if present; else legacy gasPrice
        const maxFeePerGas = tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : null;
        const gasPriceLegacy = tx.gasPrice ? BigInt(tx.gasPrice) : null;
        const gasPrice = (maxFeePerGas ?? gasPriceLegacy ?? 0n);

        const fee = gasUsed * gasPrice;

        outValue += value;
        outFee   += fee;
        countOut++;

        console.log(
          `[OUT] #${b} ${tx.hash} → ${tx.to}  value=${ethers.formatEther(value)}  ` +
          `gasUsed=${gasUsed}  gasPrice=${Number(gasPrice)/1e9} gwei  fee=${ethers.formatEther(fee)}`
        );
      } else if (toAddr === ADDR) {
        inValue += value;
        countIn++;
        console.log(`[IN ] #${b} ${tx.hash} ← ${tx.from}  value=${ethers.formatEther(value)}`);
      }
    }
  }

  console.log("\n==== Summary ====");
  console.log("Outgoing txs   :", countOut);
  console.log(" - value sent  :", ethers.formatEther(outValue), "LCAI");
  console.log(" - gas fees    :", ethers.formatEther(outFee),   "LCAI");
  console.log("Incoming txs   :", countIn);
  console.log(" - value recv  :", ethers.formatEther(inValue), "LCAI");
  console.log("---------------------------");
  console.log("NET Δ (value-fees):", ethers.formatEther(inValue - (outValue + outFee)), "LCAI");
}

main().catch((e) => { console.error(e); process.exit(1); });