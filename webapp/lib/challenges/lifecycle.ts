/**
 * webapp/lib/challenges/lifecycle.ts
 *
 * Canonical participant lifecycle resolver for the LightChallenge platform.
 *
 * ALL pages (/me/challenges, /proofs, /claims, /challenge/[id]) must use
 * this resolver as the single source of truth for participant lifecycle state.
 *
 * Pages must NOT derive lifecycle locally or trust individual raw fields
 * (e.g. verdict_pass) without lifecycle gating.
 *
 * ─── LIFECYCLE MODEL ───
 *
 *   ACTIVE              challenge still running, proof not allowed
 *     │
 *   NEEDS_PROOF          challenge ended, proof window open immediately
 *     │
 *   SUBMITTED            evidence submitted, awaiting evaluation
 *     │
 *   VERIFIED             evaluation completed successfully
 *     ├──► FAILED        evaluation failed
 *     │
 *   PASSED               successful outcome confirmed
 *     │
 *   REWARD_EARNED         reward allocated but not yet claimable on-chain
 *     │
 *   CLAIMABLE            reward confirmed claimable on-chain
 *     │
 *   CLAIMED              reward claimed (or no longer available)
 *
 *   ENDED                challenge ended without participant evidence
 *
 * ─── CRITICAL RULES ───
 *
 * Rule 1 — ACTIVE dominates: if challenge is still running, state = ACTIVE
 *          even if DB contains verdict_pass = true.
 *
 * Rule 2 — Proof states only after challenge end.
 *
 * Rule 3 — Verification requires real evaluation evidence.
 *
 * Rule 4 — Claimable requires positive eval + finalized + on-chain confirmation.
 *
 * Rule 5 — Inconsistent data → fallback to earlier lifecycle stage.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Canonical lifecycle stages in strict ordering. */
export type LifecycleStage =
  | "ACTIVE"
  | "NEEDS_PROOF"
  | "NEEDS_PROOF_URGENT"
  | "SUBMITTED"
  | "VERIFIED"
  | "PASSED"
  | "FAILED"
  | "REWARD_EARNED"
  | "CLAIMABLE"
  | "CLAIMED"
  | "ENDED";

/** Raw data input — mirrors what the API returns for a participant row. */
export type LifecycleInput = {
  challenge_id: string;

  // Challenge-level fields
  challenge_status: string | null;  // V1: Active | Finalized | Canceled (legacy V0 values also handled)
  endsAt?: number | null;           // Unix seconds — when the challenge period ends
  proofDeadline?: number | null;    // Unix seconds — evidence submission deadline

  // Participant-level fields
  has_evidence: boolean;
  evidence_submitted_at?: string | Date | null;
  evidence_provider?: string | null;
  verdict_pass: boolean | null;
  verdict_reasons?: string[] | null;
  verdict_evaluator?: string | null;
  verdict_updated_at?: string | Date | null;
  aivm_verification_status?: string | null;  // requested | committed | revealed | finalized | done

  /**
   * Chain finalization outcome from ChallengePay Finalized event.
   * 0=None, 1=Success (winners paid), 2=Fail (nobody won).
   * NULL = not yet recorded (challenge not finalized or indexer hasn't caught up).
   *
   * AUTHORITATIVE for reward eligibility. When set, it overrides verdict_pass:
   *   chainOutcome=1 (Success) + verdict_pass=true → eligible for reward
   *   chainOutcome=2 (Fail)    + verdict_pass=true → no reward (DB verdict was wrong or moot)
   *   chainOutcome=null        → fall back to verdict_pass + claimEligible simulation
   */
  chainOutcome?: number | null;

  // On-chain claim eligibility (optional, set by UI after simulation)
  claimEligible?: boolean | null;  // null = unknown, true = confirmed, false = not claimable

  // Persisted claim state (from public.claims via API)
  hasClaim?: boolean;              // true = at least one claim row persisted
  claimedTotalWei?: string | null; // total claimed wei — may be "0" for zero-value claim records
};

/** The resolved lifecycle output consumed by all pages. */
export type ResolvedLifecycle = {
  stage: LifecycleStage;

  // User-facing display
  label: string;
  description: string;
  badgeVariant: "action" | "claim" | "info" | "ok" | "bad" | "soft";
  accent: "action" | "claim" | "progress" | "ok" | "bad";

  // Boolean flags for page consumption
  isActive: boolean;
  isProofRequired: boolean;
  isProofUrgent: boolean;
  isSubmitted: boolean;
  isVerified: boolean;
  isPassed: boolean;
  isFailed: boolean;
  isRewardEarned: boolean;
  isClaimable: boolean;
  isClaimed: boolean;
  isEnded: boolean;

  // Behavioral flags
  canSubmitProof: boolean;
  canClaim: boolean;

  // Page filter classification
  shouldAppearInActive: boolean;
  shouldAppearInNeedsProof: boolean;
  shouldAppearInWon: boolean;
  shouldAppearInClaimable: boolean;

  // Proof deadline info (for urgency display)
  proofTimeLeft?: string | null;
  proofDeadlinePassed: boolean;
};

// ─── Constants ──────────────────────────────────────────────────────────────

// V1 terminal statuses. "rejected" included for legacy DB rows from V0 era.
const DONE_STATUSES = ["finalized", "canceled", "rejected"];

const AIVM_IN_PROGRESS = ["requested", "committed", "revealed"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimeLeft(deadline: number, now: number): string | null {
  const diff = deadline - now;
  if (diff <= 0) return null;
  if (diff < 3600) return `${Math.ceil(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d left`;
  return `${Math.floor(diff / 604800)}w left`;
}

function challengeStillRunning(input: LifecycleInput, now: number): boolean {
  const cs = (input.challenge_status ?? "").toLowerCase();

  // If we have an end time and it hasn't passed → running
  if (input.endsAt && input.endsAt > now) return true;

  // If no end time but status is active-like → running
  // V1 canonical: "active". Legacy V0: "approved", "paused", "pending".
  if (!input.endsAt && ["active", "approved", "paused", "pending"].includes(cs)) return true;

  return false;
}

function challengeHasEnded(input: LifecycleInput, now: number): boolean {
  // Explicit end time passed
  if (input.endsAt && input.endsAt <= now) return true;

  // Terminal on-chain status without end time
  const cs = (input.challenge_status ?? "").toLowerCase();
  if (DONE_STATUSES.includes(cs)) return true;

  return false;
}

// ─── Main Resolver ──────────────────────────────────────────────────────────

export function resolveLifecycle(input: LifecycleInput, now?: number): ResolvedLifecycle {
  const t = now ?? Math.floor(Date.now() / 1000);
  const cs = (input.challenge_status ?? "").toLowerCase();
  const aivm = (input.aivm_verification_status ?? "").toLowerCase();

  // ───────────────────────────────────────────────────────────────────────
  // RULE 1: ACTIVE dominates.
  // If the challenge is still running, the participant is ACTIVE.
  // verdict_pass, evidence, AIVM status are all irrelevant while active.
  // ───────────────────────────────────────────────────────────────────────
  if (challengeStillRunning(input, t)) {
    return makeResult("ACTIVE", {
      label: "Active",
      description: input.endsAt
        ? `Challenge in progress — ends ${formatTimeLeft(input.endsAt, t) ?? "soon"}.`
        : "Challenge in progress.",
      badgeVariant: "info",
      accent: "progress",
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // From here: challenge has ended or is in a terminal status.
  // Now we can inspect participant-level fields.
  // ───────────────────────────────────────────────────────────────────────

  // Check if proof deadline has passed (for missed-deadline detection)
  const proofDeadlinePassed = !!(input.proofDeadline && input.proofDeadline <= t);

  // ───────────────────────────────────────────────────────────────────────
  // RULE A: Chain outcome wins for finalized challenges.
  //
  // chainOutcome from the Finalized event is authoritative for reward state:
  //   1 = Success → participant may have a reward
  //   2 = Fail    → nobody won; verdict_pass is irrelevant for payout
  //   0 / null    → outcome not yet recorded; fall through to verdict_pass logic
  //
  // This handles the case where DB verdict_pass=true but chain outcome=Fail
  // (e.g. challenge had no winners pool, or participant didn't stake on-chain).
  // ───────────────────────────────────────────────────────────────────────
  if (cs === "finalized" && input.chainOutcome === 2 /* Fail */) {
    // Chain says Fail. If we have persisted claim rows, check if they had any value.
    if (input.hasClaim === true) {
      const claimedWei = BigInt(input.claimedTotalWei ?? "0");
      if (claimedWei === 0n) {
        // Zero-value claims: transactions happened but no payout was available.
        return makeResult("ENDED", {
          label: "No payout",
          description: "Challenge finalized — no payout was available for your stake.",
          badgeVariant: "soft",
          accent: "bad",
          proofDeadlinePassed,
        });
      }
      // Non-zero claims despite Fail outcome shouldn't occur, but honour them.
      return makeResult("CLAIMED", {
        label: "Claimed",
        description: "Reward claimed.",
        badgeVariant: "ok",
        accent: "ok",
        proofDeadlinePassed,
      });
    }
    // No claims and chain says Fail → no payout
    return makeResult("ENDED", {
      label: "No payout",
      description: "Challenge ended — this outcome did not result in a reward.",
      badgeVariant: "soft",
      accent: "bad",
      proofDeadlinePassed,
    });
  }

  // ── CLAIMABLE / CLAIMED / REWARD_EARNED ──
  // Reached when: cs=finalized AND (chainOutcome=1 Success, or chainOutcome=null/unknown)
  // AND verdict_pass=true (off-chain evaluator agreed).
  if (input.verdict_pass === true && cs === "finalized") {
    // Persisted claim rows exist
    if (input.hasClaim === true) {
      const claimedWei = BigInt(input.claimedTotalWei ?? "0");
      if (claimedWei === 0n) {
        // Zero-value claims: user executed claim txs but nothing was available.
        // Policy: not the same as "Claimed reward" — show "No payout" instead.
        return makeResult("ENDED", {
          label: "No payout",
          description: "Claim transactions executed — no payout was available.",
          badgeVariant: "soft",
          accent: "bad",
          proofDeadlinePassed,
        });
      }
      return makeResult("CLAIMED", {
        label: "Claimed",
        description: `Reward claimed (${input.claimedTotalWei} wei).`,
        badgeVariant: "ok",
        accent: "ok",
        proofDeadlinePassed,
      });
    }
    // CLAIMABLE: live on-chain simulation confirms reward available
    if (input.claimEligible === true) {
      return makeResult("CLAIMABLE", {
        label: "Reward Ready",
        description: "On-chain reward confirmed — claim now.",
        badgeVariant: "claim",
        accent: "claim",
        canClaim: true,
        proofDeadlinePassed,
      });
    }
    // claimEligible === false, no persisted claim → on-chain says nothing to claim
    if (input.claimEligible === false) {
      return makeResult("ENDED", {
        label: "No payout",
        description: "No reward available on-chain for this challenge.",
        badgeVariant: "soft",
        accent: "bad",
        proofDeadlinePassed,
      });
    }
    // claimEligible === null/undefined → not yet simulated
    return makeResult("REWARD_EARNED", {
      label: "Reward Earned",
      description: "Verifying on-chain reward status...",
      badgeVariant: "ok",
      accent: "ok",
      proofDeadlinePassed,
    });
  }

  // ── Canceled override — MUST come before PASSED ──
  // V1 terminal status: Canceled. Legacy V0 "rejected" treated as Canceled.
  // This check must precede the PASSED branch because challengeHasEnded() returns
  // true for canceled, so verdict_pass=true would incorrectly show "Passed".
  if (cs === "canceled" || cs === "rejected") {
    return makeResult("ENDED", {
      label: "Canceled",
      description: "Challenge was canceled.",
      badgeVariant: "bad",
      accent: "bad",
      proofDeadlinePassed,
    });
  }

  // ── PROOF WINDOW: challenge ended but proof deadline not reached ──
  // During the proof window, verdicts are preliminary (pipeline hasn't
  // finalized). Show evidence-based status, not verdict-based.
  const inProofWindow = challengeHasEnded(input, t) && !proofDeadlinePassed
    && !!input.proofDeadline && input.proofDeadline > t;

  if (inProofWindow) {
    if (input.has_evidence) {
      if (AIVM_IN_PROGRESS.includes(aivm)) {
        return makeResult("SUBMITTED", {
          label: "Verifying",
          description: `Evidence submitted — AIVM verification: ${aivm}`,
          badgeVariant: "info",
          accent: "progress",
          proofDeadlinePassed,
        });
      }
      return makeResult("SUBMITTED", {
        label: "Verifying",
        description: input.evidence_provider
          ? `Evidence submitted via ${input.evidence_provider} — awaiting finalization.`
          : "Evidence submitted — awaiting finalization.",
        badgeVariant: "info",
        accent: "progress",
        proofDeadlinePassed,
      });
    }
    // No evidence yet during proof window → needs proof
    const proofTl = input.proofDeadline ? formatTimeLeft(input.proofDeadline, t) : null;
    const hoursLeft = input.proofDeadline ? (input.proofDeadline - t) / 3600 : Infinity;
    const isUrgent = hoursLeft <= 24 && hoursLeft > 0;
    if (isUrgent) {
      return makeResult("NEEDS_PROOF_URGENT", {
        label: "Proof Urgent",
        description: `Evidence deadline: ${proofTl ?? "soon"} — submit now.`,
        badgeVariant: "action",
        accent: "action",
        canSubmitProof: true,
        proofTimeLeft: proofTl,
        proofDeadlinePassed,
      });
    }
    return makeResult("NEEDS_PROOF", {
      label: "Needs Proof",
      description: proofTl
        ? `Evidence window open — ${proofTl}.`
        : "Submit your evidence.",
      badgeVariant: "action",
      accent: "action",
      canSubmitProof: true,
      proofTimeLeft: proofTl,
      proofDeadlinePassed,
    });
  }

  // ── PASSED (verdict_pass=true but not yet finalized) ──
  if (input.verdict_pass === true && challengeHasEnded(input, t)) {
    return makeResult("PASSED", {
      label: "Passed",
      description: "Evaluation passed — waiting for on-chain finalization.",
      badgeVariant: "ok",
      accent: "ok",
      proofDeadlinePassed,
    });
  }

  // ── FAILED ──
  if (input.verdict_pass === false) {
    const reasons = input.verdict_reasons?.slice(0, 2).join(" · ");
    return makeResult("FAILED", {
      label: "Failed",
      description: reasons || "Did not meet challenge requirements.",
      badgeVariant: "bad",
      accent: "bad",
      proofDeadlinePassed,
    });
  }

  // ── SUBMITTED / VERIFIED (evidence exists, no verdict yet) ──
  if (input.has_evidence) {
    if (AIVM_IN_PROGRESS.includes(aivm)) {
      return makeResult("SUBMITTED", {
        label: "Verifying",
        description: `AIVM verification: ${aivm}`,
        badgeVariant: "info",
        accent: "progress",
        proofDeadlinePassed,
      });
    }
    // Evidence submitted but AIVM hasn't started or status unknown
    return makeResult("SUBMITTED", {
      label: "Submitted",
      description: input.evidence_provider
        ? `Evidence submitted via ${input.evidence_provider}.`
        : "Evidence submitted — awaiting evaluation.",
      badgeVariant: "info",
      accent: "progress",
      proofDeadlinePassed,
    });
  }

  // ── No evidence yet. Challenge has ended. ──

  // If proof deadline has passed → ENDED (missed)
  if (proofDeadlinePassed) {
    return makeResult("ENDED", {
      label: "Missed",
      description: "Evidence deadline passed without submission.",
      badgeVariant: "bad",
      accent: "bad",
      proofDeadlinePassed: true,
    });
  }

  // Terminal on-chain status with no evidence → ENDED
  if (DONE_STATUSES.includes(cs) && !input.has_evidence) {
    return makeResult("ENDED", {
      label: "Ended",
      description: "Challenge ended without evidence.",
      badgeVariant: "soft",
      accent: "bad",
      proofDeadlinePassed,
    });
  }

  // ── NEEDS_PROOF (challenge ended, proof window open) ──
  if (challengeHasEnded(input, t)) {
    const proofTl = input.proofDeadline ? formatTimeLeft(input.proofDeadline, t) : null;
    const hoursLeft = input.proofDeadline ? (input.proofDeadline - t) / 3600 : Infinity;
    const isUrgent = hoursLeft <= 24 && hoursLeft > 0;

    if (isUrgent) {
      return makeResult("NEEDS_PROOF_URGENT", {
        label: "Proof Urgent",
        description: `Evidence deadline: ${proofTl ?? "soon"} — submit now.`,
        badgeVariant: "action",
        accent: "action",
        canSubmitProof: true,
        proofTimeLeft: proofTl,
        proofDeadlinePassed,
      });
    }

    return makeResult("NEEDS_PROOF", {
      label: "Needs Proof",
      description: proofTl
        ? `Evidence window open — ${proofTl}.`
        : "Evidence window open — submit your proof.",
      badgeVariant: "action",
      accent: "action",
      canSubmitProof: true,
      proofTimeLeft: proofTl,
      proofDeadlinePassed,
    });
  }

  // ── Fallback ──
  return makeResult("ACTIVE", {
    label: "Active",
    description: "Challenge status is being determined.",
    badgeVariant: "info",
    accent: "progress",
  });
}

// ─── Result builder ─────────────────────────────────────────────────────────

type PartialResult = {
  label: string;
  description: string;
  badgeVariant: ResolvedLifecycle["badgeVariant"];
  accent: ResolvedLifecycle["accent"];
  canSubmitProof?: boolean;
  canClaim?: boolean;
  proofTimeLeft?: string | null;
  proofDeadlinePassed?: boolean;
};

function makeResult(stage: LifecycleStage, p: PartialResult): ResolvedLifecycle {
  return {
    stage,
    label: p.label,
    description: p.description,
    badgeVariant: p.badgeVariant,
    accent: p.accent,

    isActive: stage === "ACTIVE",
    isProofRequired: stage === "NEEDS_PROOF" || stage === "NEEDS_PROOF_URGENT",
    isProofUrgent: stage === "NEEDS_PROOF_URGENT",
    isSubmitted: stage === "SUBMITTED",
    isVerified: stage === "VERIFIED",
    isPassed: stage === "PASSED",
    isFailed: stage === "FAILED",
    isRewardEarned: stage === "REWARD_EARNED",
    isClaimable: stage === "CLAIMABLE",
    isClaimed: stage === "CLAIMED",
    isEnded: stage === "ENDED",

    canSubmitProof: p.canSubmitProof ?? false,
    canClaim: p.canClaim ?? false,

    // Filter classification
    shouldAppearInActive: stage === "ACTIVE" || stage === "SUBMITTED" || stage === "NEEDS_PROOF" || stage === "NEEDS_PROOF_URGENT",
    shouldAppearInNeedsProof: stage === "NEEDS_PROOF" || stage === "NEEDS_PROOF_URGENT",
    shouldAppearInWon: stage === "PASSED" || stage === "REWARD_EARNED" || stage === "CLAIMABLE" || stage === "CLAIMED",
    shouldAppearInClaimable: stage === "CLAIMABLE",

    proofTimeLeft: p.proofTimeLeft ?? null,
    proofDeadlinePassed: p.proofDeadlinePassed ?? false,
  };
}

// ─── Proofs page group mapping ──────────────────────────────────────────────

/** Maps lifecycle stage to the group used by the /proofs page. */
export type ValidatorGroup =
  | "in_progress"
  | "urgent"
  | "ready"
  | "submitted"
  | "verified"
  | "failed";

export function toValidatorGroup(lc: ResolvedLifecycle): ValidatorGroup {
  switch (lc.stage) {
    case "ACTIVE":
      return "in_progress";
    case "NEEDS_PROOF_URGENT":
      return "urgent";
    case "NEEDS_PROOF":
      return "ready";
    case "SUBMITTED":
      return "submitted";
    case "VERIFIED":
    case "PASSED":
    case "REWARD_EARNED":
    case "CLAIMABLE":
    case "CLAIMED":
      return "verified";
    case "FAILED":
    case "ENDED":
      return "failed";
    default:
      return "in_progress";
  }
}

// ─── Claims page section mapping ────────────────────────────────────────────

export type ClaimSection = "claimable" | "pending" | "lost" | "won" | null;

export function toClaimSection(lc: ResolvedLifecycle): ClaimSection {
  switch (lc.stage) {
    case "CLAIMABLE":
    case "REWARD_EARNED":
      // Finalized + passed → show in claimable section
      return "claimable";
    case "CLAIMED":
      // Already claimed → show in "won" section
      return "won";
    case "PASSED":
      return "pending";
    case "FAILED":
    case "ENDED":
      // Both explicit failures and "No payout" (chain_outcome=2) appear here
      return "lost";
    default:
      return null;
  }
}

// ─── My Challenges card group mapping ───────────────────────────────────────

export type CardGroup = "action" | "progress" | "done";

export function toCardGroup(lc: ResolvedLifecycle): CardGroup {
  switch (lc.stage) {
    case "NEEDS_PROOF":
    case "NEEDS_PROOF_URGENT":
    case "CLAIMABLE":
      return "action";
    case "ACTIVE":
    case "SUBMITTED":
    case "REWARD_EARNED":
    case "PASSED":
      return "progress";
    case "FAILED":
    case "CLAIMED":
    case "ENDED":
    case "VERIFIED":
      return "done";
    default:
      return "progress";
  }
}
