// scripts/stakePeerBond.ts
import { context, header, info, toWeiStrict, fail } from "../dev/utils";

async function main() {
  header("Stake Peer Bond (if supported)");
  const { cp, addr, net, signer } = await context();

  const chIdEnv = process.env.CH_ID ?? "";
  if (!/^\d+$/.test(chIdEnv)) throw new Error("CH_ID must be a non-negative integer");
  const id = BigInt(chIdEnv);

  const amountStr = process.env.AMOUNT ?? "";
  if (!amountStr) throw new Error("AMOUNT must be provided (in native decimal units)");
  const wei = toWeiStrict(amountStr);

  info("Network", net);
  info("Signer", await signer.getAddress());
  info("Contract", addr);
  info("Challenge", id.toString());
  info("Amount (wei)", wei.toString());

  // Feature-detect stakePeerBond
  const hasFn =
    (cp.interface && typeof cp.interface.getFunction === "function" &&
      (cp.interface.getFunction("stakePeerBond(uint256)") ||
       cp.interface.getFunction("stakePeerBond(uint256,uint256)") ||
       cp.interface.functions?.["stakePeerBond(uint256)"] ||
       cp.interface.functions?.["stakePeerBond(uint256,uint256)"])) ||
    (cp as any).stakePeerBond;

  if (!hasFn) {
    console.log(
      "\nℹ️  Current contract build does not support stakePeerBond().\n" +
      "    The proposal bond is fully provided by the creator at createChallenge().\n"
    );
    return;
  }

  // Try (id) or (id, amount) signatures; if first fails, try second.
  try {
    const tx = await (cp as any).stakePeerBond(id, { value: wei });
    info("Tx", tx.hash);
    const rec = await tx.wait();
    info("Block", rec.blockNumber);
    console.log("\n✅ Peer bond staked via stakePeerBond(id).\n");
  } catch (e: any) {
    if (/missing|too many arguments|arguments length/i.test(String(e?.message))) {
      const tx2 = await (cp as any).stakePeerBond(id, wei, { value: wei });
      info("Tx", tx2.hash);
      const rec2 = await tx2.wait();
      info("Block", rec2.blockNumber);
      console.log("\n✅ Peer bond staked via stakePeerBond(id, amount).\n");
    } else {
      throw e;
    }
  }
}

main().catch(fail);