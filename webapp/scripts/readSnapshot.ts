import { ABI, ADDR, publicClient } from "../lib/contracts";
import type { Address } from "viem";

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error("Usage: tsx scripts/readSnapshot.ts <id>");
  const id = BigInt(raw);
  const s: any = await publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "getSnapshot",
    args: [id],
  });
  console.dir(s, { depth: null });
}
main().catch((e)=>{console.error(e);process.exit(1);});
