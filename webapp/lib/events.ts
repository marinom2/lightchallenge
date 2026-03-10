// webapp/lib/events.ts
import { publicClient, ADDR, ZERO_ADDR } from "@/lib/contracts";
import type { Hex, GetLogsReturnType, Address } from "viem";

type ChallengeCreatedLog = {
  args: {
    id: bigint;
    creator: `0x${string}`;
    stake: bigint;
  };
  blockNumber: bigint;
  transactionHash: Hex;
};

const MAX_SPAN = 10_000n;
const MAX_RETRIES = 4;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function getChallengeCreatedLogs(from: bigint, to: bigint) {
  const challengePay = ADDR.ChallengePay as Address;

  if (!challengePay || (challengePay as any) === ZERO_ADDR) {
    throw new Error("Missing ChallengePay address (deployments/lightchain.json not loaded at build?)");
  }

  const logs: ChallengeCreatedLog[] = [];
  let start = from;

  while (start <= to) {
    const end = start + MAX_SPAN - 1n > to ? to : start + MAX_SPAN - 1n;
    let attempt = 0;

    for (;;) {
      try {
        const chunk = (await publicClient.getLogs({
          address: challengePay,
          event: {
            type: "event",
            name: "ChallengeCreated",
            inputs: [
              { indexed: true, name: "id", type: "uint256" },
              { indexed: true, name: "creator", type: "address" },
              { indexed: false, name: "stake", type: "uint256" },
            ],
          } as any,
          fromBlock: start,
          toBlock: end,
        })) as GetLogsReturnType;

        for (const l of chunk) {
          logs.push({
            // @ts-ignore viem typed args
            args: l.args,
            blockNumber: l.blockNumber!,
            transactionHash: l.transactionHash!,
          });
        }
        break;
      } catch (err) {
        if (attempt++ >= MAX_RETRIES) throw err;
        await sleep(300 * attempt);
      }
    }

    start = end + 1n;
  }

  return logs.sort((a, b) => (a.blockNumber < b.blockNumber ? -1 : 1));
}

// === Dashboard helpers ===
export type ChallengeCreatedEvt = {
  id: bigint;
  creator: Address;
  stake: bigint;
  blockNumber: bigint;
  txHash: Hex;
};

export async function fetchCreatedWindow(fromBlock: bigint, toBlock: bigint) {
  const logs = await getChallengeCreatedLogs(fromBlock, toBlock);

  const items: ChallengeCreatedEvt[] = logs.map((l) => ({
    id: l.args.id,
    creator: l.args.creator as Address,
    stake: l.args.stake,
    blockNumber: l.blockNumber,
    txHash: l.transactionHash,
  }));

  const span = toBlock - fromBlock;
  const next = {
    fromBlock: fromBlock > span ? fromBlock - span : 0n,
    toBlock: fromBlock > 0n ? fromBlock - 1n : 0n,
  };

  return { items, next, fromBlock, toBlock };
}

export async function fetchMoreCreated(
  arg1: { fromBlock: bigint; toBlock: bigint } | bigint,
  arg2?: bigint,
) {
  if (typeof arg1 === "bigint") {
    return fetchCreatedWindow(arg1, arg2 as bigint);
  }
  return fetchCreatedWindow(arg1.fromBlock, arg1.toBlock);
}