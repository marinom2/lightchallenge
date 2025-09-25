// scripts/dev/generateWallets.ts
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  const wallets: { address: string; privateKey: string }[] = [];

  for (let i = 0; i < 2; i++) {
    const w = ethers.Wallet.createRandom();
    wallets.push({ address: w.address, privateKey: w.privateKey });
  }

  console.log("Generated wallets:");
  wallets.forEach((w, i) => {
    console.log(`#PK${i} ${w.address} ${w.privateKey}`);
  });

  const file = path.join("scripts", "dev", "wallets.json");
  fs.writeFileSync(file, JSON.stringify(wallets, null, 2));

  console.log(`\n💾 Saved 2 wallets to ${file}`);
  console.log("⚠️  Remember to export as env vars when running scripts:");
  console.log("   export PK0=<privateKey_of_first_wallet>");
  console.log("   export PK1=<privateKey_of_second_wallet>");
}

main();