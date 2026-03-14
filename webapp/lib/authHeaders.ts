/**
 * Client-side wallet auth header builder.
 *
 * Creates the `x-lc-address`, `x-lc-signature`, `x-lc-timestamp` headers
 * required by `verifyWallet()` on the server.
 *
 * Message format: `lightchallenge:{timestamp}`
 */

import type { WalletClient } from "viem";

export async function buildAuthHeaders(
  wc: WalletClient
): Promise<Record<string, string>> {
  if (!wc.account) throw new Error("Wallet account is not available.");

  const timestamp = String(Date.now());
  const message = `lightchallenge:${timestamp}`;

  const signature = await wc.signMessage({
    account: wc.account,
    message,
  });

  return {
    "x-lc-address": wc.account.address,
    "x-lc-signature": signature,
    "x-lc-timestamp": timestamp,
  };
}
