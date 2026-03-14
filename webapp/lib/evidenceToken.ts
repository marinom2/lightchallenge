/**
 * Client-side evidence token generation.
 *
 * When a user wants to submit evidence via the iOS HealthKit app, the webapp
 * asks the user to sign a challenge-scoped message with their connected wallet.
 * The resulting signature + expiry are passed through the deep link URL.
 * The iOS app includes them in the evidence submission request.
 * The server recovers the signer and verifies it matches the subject.
 *
 * This avoids requiring a private key on the iOS device while still proving
 * that the wallet owner authorized the evidence submission.
 */

import type { WalletClient } from "viem";
import { buildEvidenceTokenMessage } from "./auth";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000; // 30 minutes

export interface EvidenceToken {
  token: string;   // EIP-191 signature hex
  expires: number; // Unix ms
}

/**
 * Generate a signed evidence token for a specific challenge + subject.
 * Must be called from a context where the wallet is connected (browser).
 */
export async function generateEvidenceToken(
  walletClient: WalletClient,
  challengeId: string,
  subject: string
): Promise<EvidenceToken> {
  const expires = Date.now() + TOKEN_LIFETIME_MS;
  const message = buildEvidenceTokenMessage(challengeId, subject, expires);

  const token = await walletClient.signMessage({
    account: walletClient.account!,
    message,
  });

  return { token, expires };
}

/**
 * Build a deep link URL with the evidence token embedded.
 * The iOS app parses these query params and sends them with the submission.
 */
export function buildDeepLinkWithToken(
  challengeId: string,
  subject: string,
  evidenceToken: EvidenceToken
): string {
  const params = new URLSearchParams();
  params.set("subject", subject);
  params.set("token", evidenceToken.token);
  params.set("expires", String(evidenceToken.expires));
  return `lightchallenge://challenge/${challengeId}?${params.toString()}`;
}
