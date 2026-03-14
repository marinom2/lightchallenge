// webapp/app/challenges/create/lib/utils.ts
import { keccak256, toBytes, isAddress } from "viem";

export function generateExternalId(seed: string): `0x${string}` {
  return keccak256(
    toBytes(`${seed || ""}|${Date.now()}|${Math.random().toString(36).slice(2)}`)
  );
}

export function formatAddress(address?: unknown): string {
  if (typeof address !== "string") return "";
  if (!isAddress(address)) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTreasuryAddress(treasury?: unknown): string {
  const short = formatAddress(treasury);
  return short ? `Treasury: ${short}` : "Treasury: (unavailable)";
}

export function humanizeError(e: unknown): string {
  const raw = String((e as any)?.shortMessage || (e as any)?.message || e || "");

  if (/user rejected|denied transaction/i.test(raw)) return "Transaction rejected in wallet.";
  if (/insufficient funds/i.test(raw)) return "Insufficient funds for this transaction.";
  if (/nonce (too low|already used)/i.test(raw)) return "Nonce issue. Wait for pending transactions and try again.";
  if (/replacement|already known/i.test(raw)) return "Replacement or nonce conflict. Try again in a moment.";
  if (/underpriced|fee cap|tip higher than max/i.test(raw)) return "Gas or fee parameters were rejected by the RPC.";
  if (/intrinsic gas|out of gas/i.test(raw)) return "Gas limit too low.";

  if (/WrongMsgValue/i.test(raw)) return "The sent native amount does not match the stake.";
  if (/AmountZero/i.test(raw)) return "Amount must be greater than zero.";

  if (/StartTooSoon/i.test(raw)) return "Start time is too soon.";
  if (/LeadTimeOutOfBounds/i.test(raw)) return "Lead time is outside protocol limits.";
  if (/ApprovalDeadlineAfterStart/i.test(raw)) return "Join close must be before start.";
  if (/ApprovalWindowTooShort/i.test(raw)) return "Approval window is too short.";
  if (/InvalidBounds/i.test(raw)) return "Timeline bounds are invalid.";
  if (/ProofDeadlineBeforeEnd/i.test(raw)) return "Proof deadline must be at or after challenge end.";
  if (/DeadlineRequired/i.test(raw)) return "A required deadline is missing.";

  if (/ZeroAddress/i.test(raw)) return "A required contract address is missing or invalid.";
  if (/TokenNotAllowed/i.test(raw)) return "This token is not allowed.";
  if (/ExternalIdAlreadyUsed/i.test(raw)) return "External ID is already used.";

  if (/ProofRequired/i.test(raw)) return "A proof is required.";
  if (/ProofNotSet/i.test(raw)) return "Proof is required but no verifier is configured.";
  if (/ProofWindowClosed/i.test(raw)) return "Proof window is closed.";

  if (/PausedOrCanceled|ChallengePaused/i.test(raw)) return "The challenge or protocol is paused.";
  if (/AfterDeadline/i.test(raw)) return "This action is past its deadline.";
  if (/BeforeDeadline/i.test(raw)) return "This action is too early.";
  if (/JoinWindowClosed/i.test(raw)) return "Join window is closed.";

  console.error("[humanizeError] Unhandled error:\n", e);
  return "Transaction failed. See console for raw details.";
}