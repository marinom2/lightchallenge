// webapp/lib/errorMap.ts
export const ERROR_MAP: Record<string, string> = {
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
  };
  
  export function humanErrorMessage(e: any) {
    const msg: string = e?.shortMessage || e?.message || "";
    // Try to pick the first known error token inside the message
    for (const key of Object.keys(ERROR_MAP)) {
      if (msg.includes(key)) return ERROR_MAP[key];
    }
    return msg || "Transaction failed";
  }