/**
 * Wallet-signature authentication for LightChallenge API.
 *
 * Auth model: Each request carries a signed message `lightchallenge:{timestamp}`.
 * The signature proves wallet ownership. Nonce tracking prevents replay within
 * the 5-minute validity window.
 *
 * Limitations:
 * - No persistent sessions (each request requires signing)
 * - In-memory nonce store (resets on server restart; acceptable for Next.js serverless)
 * - For production at scale, consider migrating to SIWE (Sign-In with Ethereum)
 *   with server-side session tokens
 *
 * Headers required:
 *   x-lc-address: Wallet address (checksummed or lowercase)
 *   x-lc-signature: EIP-191 personal_sign of `lightchallenge:{timestamp}`
 *   x-lc-timestamp: Unix epoch milliseconds
 */

import { recoverMessageAddress } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { RPC_URL } from "./lightchain";

export interface VerifiedWallet {
  address: string; // checksummed
}

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

// ── Nonce-based replay protection ──────────────────────────────────────────────
// In-memory set of used signatures, keyed by signature hex string.
// Each entry expires at the same time the timestamp window closes,
// so memory usage is bounded to at most ~5 minutes of active signatures.

const usedSignatures = new Map<string, number>(); // signature -> expiry timestamp (ms)

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupNonces(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [sig, expiry] of usedSignatures) {
    if (now > expiry) usedSignatures.delete(sig);
  }
}

// ── Verification ───────────────────────────────────────────────────────────────

/**
 * Verify wallet signature from request headers.
 * Headers: x-lc-address, x-lc-signature, x-lc-timestamp
 * Message format: `lightchallenge:${timestamp}`
 */
export async function verifyWallet(req: NextRequest): Promise<VerifiedWallet | null> {
  const address = req.headers.get("x-lc-address");
  const signature = req.headers.get("x-lc-signature");
  const timestamp = req.headers.get("x-lc-timestamp");

  if (!address || !signature || !timestamp) return null;

  const ts = Number(timestamp);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > MAX_TIMESTAMP_DRIFT_MS) return null;

  // Periodic cleanup of expired entries
  cleanupNonces();

  // Reject replayed signatures within the validity window
  if (usedSignatures.has(signature)) return null;

  try {
    const message = `lightchallenge:${timestamp}`;
    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    if (recovered.toLowerCase() !== address.toLowerCase()) return null;

    // Mark signature as used; expires when the timestamp window closes
    usedSignatures.set(signature, ts + MAX_TIMESTAMP_DRIFT_MS);

    return { address: recovered };
  } catch {
    return null;
  }
}

/**
 * Require authenticated wallet. Returns 401 Response if not authenticated.
 * If expectedSubject is provided, also checks that the wallet matches (403 if not).
 */
export function requireAuth(
  wallet: VerifiedWallet | null,
  expectedSubject?: string
): NextResponse | null {
  if (!wallet) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (expectedSubject && wallet.address.toLowerCase() !== expectedSubject.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null; // auth passed
}

// ── Tx-receipt auth (mobile fallback) ─────────────────────────────────────────
// Mobile wallets (MetaMask via WalletConnect) can't easily do personal_sign
// for API auth after a transaction. Instead, the mobile app sends the txHash
// and we verify the transaction's `from` address on-chain.

/**
 * Verify wallet ownership by checking a transaction receipt on LightChain.
 * The `from` field of the confirmed transaction must match the claimed address.
 *
 * @param txHash - The 0x-prefixed transaction hash
 * @param claimedAddress - The address the caller claims to own
 * @param expectedTo - Optional: require the tx was sent to this contract address
 */
export async function verifyByTxReceipt(
  txHash: string,
  claimedAddress: string,
  expectedTo?: string
): Promise<VerifiedWallet | null> {
  if (!txHash || !txHash.startsWith("0x") || txHash.length < 10) return null;
  if (!claimedAddress) return null;

  try {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const json = await res.json();
    const receipt = json?.result;
    if (!receipt) {
      console.warn(`[txReceiptAuth] no receipt for ${txHash} (RPC: ${RPC_URL})`);
      return null;
    }

    // Transaction must have succeeded (status 0x1)
    if (receipt.status !== "0x1") {
      console.warn(`[txReceiptAuth] tx ${txHash} status=${receipt.status}`);
      return null;
    }

    // Verify `from` matches claimed address
    const txFrom = (receipt.from as string || "").toLowerCase();
    if (txFrom !== claimedAddress.toLowerCase()) {
      console.warn(`[txReceiptAuth] from mismatch: receipt=${txFrom} claimed=${claimedAddress.toLowerCase()}`);
      return null;
    }

    // Optionally verify the tx was sent to the expected contract
    if (expectedTo) {
      const txTo = (receipt.to as string || "").toLowerCase();
      if (txTo !== expectedTo.toLowerCase()) {
        console.warn(`[txReceiptAuth] to mismatch: receipt=${txTo} expected=${expectedTo.toLowerCase()}`);
        return null;
      }
    }

    return { address: claimedAddress };
  } catch (err) {
    console.error(`[txReceiptAuth] RPC error for ${txHash}:`, err);
    return null;
  }
}

// ── Evidence token ────────────────────────────────────────────────────────────
// One-time token for iOS HealthKit evidence submission.
// The webapp signs a challenge-scoped message and passes the token via deep link.
// The iOS app includes it with the submission; the server recovers the signer.
//
// Message: `lightchallenge-evidence:{challengeId}:{subject}:{expires}`
// Token lifetime: 30 minutes (generous — user may need time to collect data)

const EVIDENCE_TOKEN_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Build the message string that must be signed for an evidence token.
 */
export function buildEvidenceTokenMessage(
  challengeId: string,
  subject: string,
  expires: number
): string {
  return `lightchallenge-evidence:${challengeId}:${subject.toLowerCase()}:${expires}`;
}

/**
 * Verify an evidence token from form fields.
 * Returns the verified wallet address or null.
 */
export async function verifyEvidenceToken(
  token: string,
  challengeId: string,
  subject: string,
  expires: string
): Promise<VerifiedWallet | null> {
  const exp = Number(expires);
  if (isNaN(exp) || Date.now() > exp) return null; // expired

  // Reject if token was issued too far in the past
  if (Date.now() - exp > EVIDENCE_TOKEN_MAX_AGE_MS) return null;

  try {
    const message = buildEvidenceTokenMessage(challengeId, subject, exp);
    const recovered = await recoverMessageAddress({
      message,
      signature: token as `0x${string}`,
    });
    if (recovered.toLowerCase() !== subject.toLowerCase()) return null;
    return { address: recovered };
  } catch {
    return null;
  }
}
