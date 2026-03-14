/* webapp/app/components/challenge/PrimaryActionResolver.ts */
import type { LucideIcon } from "lucide-react";
import {
  Receipt,
  Sparkles,
  Users,
  BadgeCheck,
  Vote,
  Hourglass,
  CheckCircle2,
  Clock,
  Calendar,
  Info,
} from "lucide-react";

export type PrimaryAction = {
  kind:
    | "claims"
    | "finalize"
    | "join"
    | "proofs"
    | "vote"
    | "waiting"
    | "done"
    | "active"
    | "upcoming"
    | "neutral";
  title: string;
  desc: string;
  cta: string;
  icon: LucideIcon;
  disabled?: boolean;
  disabledReason?: string;
  onClick?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function resolvePrimaryAction(ctx: {
  // Claims
  shouldShowClaims: boolean;
  claimablesCount: number;
  busy: string | null;

  // Admin / settlement
  isAdmin: boolean;
  canFinalize: boolean;
  effectiveStatus?: string;
  needsSettlement?: boolean;

  // Join
  shouldShowJoin: boolean;
  hasJoined: boolean;
  joinDisabledReason?: string;

  // Proofs / vote
  shouldShowProofs: boolean;
  shouldShowVote: boolean;
  voteDisabledReason?: string;

  // Status flags
  isFinalizing: boolean;
  isCompleted: boolean;
  isInProgress: boolean;
  isUpcoming: boolean;

  // Schedule
  joinWindowOpen: boolean;

  // Actions
  onClaimAll: () => void;
  onFinalize: () => void;
  onRefresh: () => void;
  onExplore: () => void;
  onSubmitProof: () => void;
  onOpenValidators: () => void;
}): PrimaryAction {
  const {
    shouldShowClaims,
    claimablesCount,
    busy,

    isAdmin,
    canFinalize,
    effectiveStatus,
    needsSettlement,

    shouldShowJoin,
    hasJoined,
    joinDisabledReason,

    shouldShowProofs,
    shouldShowVote,
    voteDisabledReason,

    isFinalizing,
    isCompleted,
    isInProgress,
    isUpcoming,

    joinWindowOpen,

    onClaimAll,
    onFinalize,
    onRefresh,
    onExplore,
    onSubmitProof,
    onOpenValidators,
  } = ctx;

  const txBusy = busy !== null;
  const busyReason = "A transaction is already in progress.";

  // 1) Claims always win
  if (shouldShowClaims) {
    return {
      kind: "claims",
      title: "Claim your reward",
      desc: "Reward available — claim now",
      cta: busy === "claimAll" ? "Claiming…" : "Claim",
      icon: Receipt,
      disabled: txBusy,
      disabledReason: txBusy ? busyReason : undefined,
      onClick: onClaimAll,
      secondaryLabel: "Refresh",
      onSecondary: onRefresh,
    };
  }

  // 2) Admin settlement (only when it actually needs settlement)
  // V1 status model: challenges are "Active" until finalized/canceled.
  if (
    isAdmin &&
    String(effectiveStatus) === "Active" &&
    needsSettlement
  ) {
    const disabled = txBusy || !canFinalize;
    return {
      kind: "finalize",
      title: "Settle payouts",
      desc: "Challenge ended — settle outcome so claims can be made",
      cta: busy === "finalize" ? "Settling…" : "Settle payouts",
      icon: Sparkles,
      disabled,
      disabledReason: disabled ? (txBusy ? busyReason : "Finalization is not available right now.") : undefined,
      onClick: onFinalize,
      secondaryLabel: "Refresh",
      onSecondary: onRefresh,
    };
  }

  // 3) Proofs (actionable)
  if (shouldShowProofs) {
    return {
      kind: "proofs",
      title: "Submit proof",
      desc: "Provide verification",
      cta: "Submit proof",
      icon: BadgeCheck,
      disabled: txBusy,
      disabledReason: txBusy ? busyReason : undefined,
      onClick: onSubmitProof,
      secondaryLabel: "All proofs",
      onSecondary: onOpenValidators,
    };
  }

  // 4) Join rail (informational; actual join happens in JoinCard)
  if (shouldShowJoin) {
    return {
      kind: "join",
      title: hasJoined ? "Top up commitment" : "Join the challenge",
      desc: hasJoined ? "Increase your stake" : "Commit stake to participate",
      cta: hasJoined ? "Top up" : "Join",
      icon: Users,
      disabled: false,
      disabledReason: joinDisabledReason,
    };
  }

  // 5) Vote rail (informational; voting UI is below)
  if (shouldShowVote) {
    return {
      kind: "vote",
      title: "Validator vote",
      desc: "Vote while the window is open",
      cta: "Vote",
      icon: Vote,
      disabled: false,
      disabledReason: voteDisabledReason,
    };
  }

  // 6) Status fallbacks
  if (isFinalizing) {
    return {
      kind: "waiting",
      title: "Finalizing",
      desc: "Winners are being calculated",
      cta: "Refresh",
      icon: Hourglass,
      disabled: Boolean(txBusy),
      disabledReason: txBusy ? busyReason : undefined,
      onClick: onRefresh,
    };
  }

  if (isCompleted) {
    return {
      kind: "done",
      title: "Completed",
      desc: "Challenge finalized",
      cta: "Explore",
      icon: CheckCircle2,
      onClick: onExplore,
    };
  }

  if (isInProgress) {
    return {
      kind: "active",
      title: "In progress",
      desc: "Challenge is running",
      cta: "Explore",
      icon: Clock,
      onClick: onExplore,
    };
  }

  if (isUpcoming) {
    return {
      kind: "upcoming",
      title: "Upcoming",
      desc: joinWindowOpen ? "Join is open" : "Join closed",
      cta: "Explore",
      icon: Calendar,
      onClick: onExplore,
    };
  }

  return {
    kind: "neutral",
    title: "Challenge",
    desc: "Review details below",
    cta: "Explore",
    icon: Info,
    onClick: onExplore,
  };
}