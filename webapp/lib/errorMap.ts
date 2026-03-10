// webapp/lib/errorMap.ts
import type { Abi, Hex } from "viem";
import { decodeErrorResult } from "viem";

export const ERROR_MAP: Record<string, string> = {
  // From your list
  NotAdmin: "Only admins can do that.",
  StartTooSoon: "Start time is too soon.",
  ApprovalWindowTooShort: "Approval window is too short.",
  PeerQuorumInvalid: "Peer quorum/threshold invalid.",
  CharityTooHigh: "Charity basis points exceed the limit.",
  WrongMsgValue: "The sent value doesn't match the required amount.",
  NotPending: "Challenge is not pending.",
  AlreadyCanceled: "Challenge is canceled or already finalized.",
  PausedOrCanceled: "Challenge is paused or canceled.",
  NotApproved: "Challenge is not approved yet.",
  AlreadyVoted: "You've already voted.",
  NotPeer: "Only listed peers can vote.",
  BeforeDeadline: "Action not allowed before the deadline.",
  AfterDeadline: "Action not allowed after the deadline.",
  PeersNotMet: "Peer approvals not met.",
  NativeSendFailed: "Native transfer failed.",
  NotValidator: "Only validators can do that.",
  MinStakeNotMet: "Your validator stake is below the minimum.",
  CooldownNotElapsed: "Unstake cooldown hasn't elapsed yet.",
  HasOpenVoteLocks: "You have open vote locks.",
  AmountZero: "Enter an amount greater than zero.",
  QuorumOrThresholdInvalid: "Validator quorum/threshold invalid.",
  MaxParticipantsReached: "Participant cap reached.",
  ProofNotSet: "A proof/verifier is required before this action.",
  NotEligible: "You're not eligible for this claim.",
  AlreadyClaimed: "You already claimed this.",

  // Common create() failures :
  LeadTimeOutOfBounds: "Start is too near/far from now. Pick a later start.",
  ApprovalDeadlineAfterStart: "Join deadline must be before the start time.",
  InvalidBounds: "Timeline bounds invalid (start/end/duration).",
  TokenNotAllowed: "That ERC-20 is not allowed.",
  GlobalPaused: "Protocol is paused right now.",
  CharityAddressRequired: "Charity address is required when charity % > 0.",
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