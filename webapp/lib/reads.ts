// webapp/lib/reads.ts
import { createPublicClient, http, type Address } from "viem";
import { lightchain } from "./lightchain";
import { ABI, ADDR } from "./contracts";

const RPC = lightchain.rpcUrls.default.http[0]!;

export const publicClient = createPublicClient({
  chain: lightchain,
  transport: http(RPC),
});

export async function readChallenge(id: bigint) {
  return publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "getChallenge",
    args: [id],
  });
}

// Extra helpers your page/components rely on:

export async function getSnapshot(id: bigint) {
  return publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "getSnapshot",
    args: [id],
  });
}

export async function getValidatorClaimInfo(id: bigint, who: Address) {
  return publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "getValidatorClaimInfo",
    args: [id, who],
  });
}

export async function contribOf(id: bigint, who: Address) {
  return publicClient.readContract({
    abi: ABI.ChallengePay,
    address: ADDR.ChallengePay as Address,
    functionName: "contribOf",
    args: [id, who],
  });
}