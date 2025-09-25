import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-ethers";
// scripts/txLookup.ts
import hardhat from "hardhat";
const { ethers } = hardhat;
import * as dotenv from "dotenv";
dotenv.config();

/**
 * USAGE:
 *   TX=0xabc... npx hardhat run scripts/txLookup.ts --network lightchain
 */
async function main() {
  const hash = process.env.TX;
  if (!hash) {
    throw new Error("Set TX=0x... in the environment.");
  }

  const provider = ethers.provider;
  const tx = await provider.getTransaction(hash);
  const rec = await provider.getTransactionReceipt(hash);

  console.log("\n================ TX LOOKUP ================\n");
  console.log(`Tx hash        : ${hash}`);
  console.log(`From           : ${tx?.from}`);
  console.log(`To             : ${tx?.to}`);
  console.log(`Nonce          : ${tx?.nonce}`);
  console.log(`Value          : ${tx ? ethers.formatEther(tx.value) : "(n/a)"} (native)`);
  console.log(`Block number   : ${rec?.blockNumber ?? "(pending)"}`);
  console.log(`Status         : ${rec ? (rec.status === 1 ? "SUCCESS" : "FAILED") : "(pending)"}`);
  console.log(`Gas used       : ${rec?.gasUsed?.toString?.() ?? "(n/a)"}`);
  console.log(`Logs count     : ${rec?.logs?.length ?? 0}`);
  console.log("\n==========================================\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});