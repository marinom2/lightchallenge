// scripts/dev/txcost.ts
import "dotenv/config";
import { ethers } from "ethers";

async function main() {
  const RPC = process.env.LIGHTCHAIN_RPC || "";
  if (!RPC) throw new Error("Set LIGHTCHAIN_RPC");

  const TXS = (process.env.TXS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (TXS.length === 0) {
    console.log("Usage:");
    console.log('  TXS=0xabc,0xdef npx ts-node scripts/dev/txcost.ts');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);

  let totalValue = 0n;
  let totalFee   = 0n;

  console.log("\nTx Hash                                                    Value(LCAI)        GasUsed  GasPrice(gwei)    Fee(LCAI)   To");
  console.log("-------------------------------------------------------------------------------------------------------------------------------------");

  for (const h of TXS) {
    const tx = await provider.getTransaction(h);
    if (!tx) { console.log(`${h}  NOT_FOUND`); continue; }
    const rec = await provider.getTransactionReceipt(h);
    if (!rec) { console.log(`${h}  PENDING`); continue; }

    const gasUsed = rec.gasUsed ?? 0n;
    const gasPrice = (tx.maxFeePerGas ?? tx.gasPrice ?? 0n); // EIP-1559 or legacy
    const fee = gasUsed * gasPrice;

    const valueEth = ethers.formatEther(tx.value ?? 0n);
    const feeEth   = ethers.formatEther(fee);
    const gasGwei  = Number(gasPrice) / 1e9;

    totalValue += (tx.value ?? 0n);
    totalFee   += fee;

    console.log(
      `${h}  ${valueEth.padStart(12)}   ${gasUsed.toString().padStart(9)}  ${gasGwei.toFixed(2).padStart(12)}   ${feeEth.padStart(12)}   ${tx.to || "<create>"}`
    );
  }

  console.log("-------------------------------------------------------------------------------------------------------------------------------------");
  console.log("TOTAL value sent:", ethers.formatEther(totalValue), "LCAI");
  console.log("TOTAL gas fee   :", ethers.formatEther(totalFee),   "LCAI");
  console.log("GRAND TOTAL     :", ethers.formatEther(totalValue + totalFee), "LCAI");
}

main().catch((e) => { console.error(e); process.exit(1); });