// webapp/lib/explainFailedTx.ts
import type { Abi, Hex, PublicClient } from "viem";
import { decodeErrorResult } from "viem";
import { ERROR_MAP } from "./errorMap";

/**
 * Explain a mined failed tx by replaying the call at the block it failed.
 */
export async function explainFailedTx(
  pc: PublicClient,
  hash: `0x${string}`,
  abi: Abi
): Promise<string> {
  const [tx, receipt] = await Promise.all([
    pc.getTransaction({ hash }),
    pc.getTransactionReceipt({ hash }),
  ]);

  // Re-run the call at that block to get the revert data
  let revertData: string | undefined;
  try {
    const out = await pc.call({
      to: tx.to!,
      data: tx.input as Hex,
      blockNumber: receipt.blockNumber,
    });
    // If it didn't throw, we still may get 0x on some RPCs for failures
    revertData = typeof out === "string" ? out : undefined;
  } catch (err: any) {
    // Many RPCs throw and carry the revert data in .data
    revertData =
      err?.data?.data ?? err?.data ?? err?.cause?.data ?? err?.error?.data;
  }

  if (typeof revertData === "string" && revertData.startsWith("0x")) {
    try {
      const dec = decodeErrorResult({ abi, data: revertData as Hex });
      const name = dec.errorName;
      if (ERROR_MAP[name]) return ERROR_MAP[name];
      const args =
        Array.isArray(dec.args) && dec.args.length
          ? ` (${dec.args.join(", ")})`
          : "";
      return `${name}${args}`;
    } catch {
      // ignore
    }
  }
  return "Could not decode revert (no data from RPC).";
}