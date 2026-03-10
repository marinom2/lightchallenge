import { ABI, ADDR } from "../lib/contracts";
import { createWalletClient, http, parseEther } from "viem";
import type { Address } from "viem";

async function main() {
  const [idRaw, amtRaw, pk] = process.argv.slice(2);
  if (!idRaw || !amtRaw || !pk) {
    throw new Error("Usage: tsx scripts/joinNative.ts <id> <amount-eth> <privateKey-0x...>");
  }
  const id = BigInt(idRaw);
  const account = (pk as `0x${string}`);
  const wallet = createWalletClient({ account, chain: { id: 504, name:"lightchain", nativeCurrency:{name:"LCAI",symbol:"LCAI",decimals:18}, rpcUrls:{default:{http:[process.env.NEXT_PUBLIC_RPC_URL||"https://light-testnet-rpc.lightchain.ai"]}}}, transport: http(process.env.NEXT_PUBLIC_RPC_URL||"https://light-testnet-rpc.lightchain.ai") });

  const hash = await wallet.writeContract({
    address: ADDR.ChallengePay as Address,
    abi: ABI.ChallengePay,
    functionName: "joinChallengeNative",
    args: [id],
    value: parseEther(amtRaw),
  });
  console.log("tx hash:", hash);
}
main().catch((e)=>{console.error(e);process.exit(1);});
