// webapp/lib/errorMap.ts
import type { Abi, Hex } from "viem";
import { decodeErrorResult } from "viem";

export const ERROR_MAP: Record<string, string> = {
  // ChallengePay V1 errors
  NotAdmin: "Only admins can do that.",
  NotPendingAdmin: "Only the pending admin can accept.",
  ZeroAddress: "Address cannot be zero.",
  AmountZero: "Enter an amount greater than zero.",
  WrongMsgValue: "The sent value doesn't match the required amount.",
  ChallengePaused: "This challenge is paused.",
  StartTooSoon: "Start time is too soon.",
  LeadTimeOutOfBounds: "Start is too near/far from now. Pick a later start.",
  InvalidBounds: "Timeline bounds invalid (start/end/duration).",
  DeadlineRequired: "A proof deadline is required.",
  ProofDeadlineBeforeEnd: "Proof deadline must be after the challenge ends.",
  JoinClosesAfterStart: "Join window must close before or at start.",
  TokenNotAllowed: "That ERC-20 is not allowed.",
  ExternalIdAlreadyUsed: "That external ID is already in use.",
  NotCreatorOrAdmin: "Only the creator or admin can do that.",
  NotActive: "Challenge is not active.",
  AlreadyCanceled: "Challenge is already canceled or finalized.",
  JoinWindowClosed: "Join window has closed.",
  MaxParticipantsReached: "Participant cap reached.",
  ProofNotOpen: "Proof window is not open yet.",
  ProofWindowClosed: "Proof window has closed.",
  NotEligible: "You're not eligible for this claim.",
  AlreadyWinner: "You're already recorded as a winner.",
  AlreadyFinalized: "Challenge is already finalized.",
  BeforeDeadline: "Action not allowed before the deadline.",
  TightenOnlyViolation: "You can only tighten (reduce) this parameter.",
  GlobalPausedError: "Protocol is paused right now.",
  ChallengeNotFinalized: "Challenge must be finalized first.",
  AlreadyClaimed: "You already claimed this.",
  NativeSendFailed: "Native transfer failed.",

  // MetadataRegistry errors
  NotOwner: "Only the registry owner can do that.",
  AlreadySet: "Metadata URI is already set (write-once).",
  EmptyUri: "URI cannot be empty.",
  LenMismatch: "Array lengths do not match.",

  // ChallengeAchievement errors
  SoulboundToken: "This token is soulbound and cannot be transferred.",
  NotFinalized: "Challenge must be finalized before claiming achievements.",
  NotParticipant: "You must be a participant to claim this achievement.",
  NotWinner: "Only winners can claim a Victory achievement.",
  AlreadyMinted: "You already claimed this achievement.",
};

export function humanErrorMessage(e: any): string {
  const msg: string = e?.shortMessage || e?.message || "";
  for (const key of Object.keys(ERROR_MAP)) {
    if (msg.includes(key)) return ERROR_MAP[key];
  }
  return msg || "Transaction failed";
}

/** Decoder for viem-style revert objects (simulate/send failures) */
export function decodeRevertFriendly(e: any, abi: Abi): string {
  const data: unknown =
    e?.data?.data ?? e?.data ?? e?.cause?.data ?? e?.error?.data ?? null;

  if (typeof data === "string" && data.startsWith("0x")) {
    try {
      const dec = decodeErrorResult({ abi, data: data as Hex });
      const name = dec.errorName || "Error";
      const mapped = ERROR_MAP[name];
      if (mapped) return mapped;
      const args =
        Array.isArray(dec.args) && dec.args.length
          ? ` (${dec.args.join(", ")})`
          : "";
      return `${name}${args}`;
    } catch {
      // fallthrough
    }
  }
  return humanErrorMessage(e);
}