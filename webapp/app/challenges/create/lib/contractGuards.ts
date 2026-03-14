// webapp/app/challenges/create/lib/contractGuards.ts
import { addMinutes, isAfter, isBefore } from "date-fns";
import type { ChallengeFormState } from "../state/types";
import {
  SAFE_APPROVAL_WINDOW_SEC,
  SAFE_MIN_LEAD_SEC,
} from "./constants";

export type ChainRules = {
  minLeadSec: number;
  maxLeadSec: number | null;
  maxDurSec: number | null;
  chainNow: number;
  paused: boolean;

  allowlistEnabled: boolean | null;
  tokenAllowed: boolean | null;
};

export const DEFAULT_PROOF_GRACE_MIN = 60;

function requiredLeadSec(rules: ChainRules) {
  return Math.max(
    rules.minLeadSec || 0,
    SAFE_MIN_LEAD_SEC
  );
}

export function clampLeadStart(
  start: Date,
  rules: ChainRules
): { start: Date; touched: boolean; reason?: string } {
  let next = start;

  const minStart = new Date((rules.chainNow + requiredLeadSec(rules)) * 1000);
  if (isBefore(next, minStart)) {
    next = minStart;
    return {
      start: next,
      touched: true,
      reason: "Start moved to satisfy minimum lead time.",
    };
  }

  if (rules.maxLeadSec && rules.maxLeadSec > 0) {
    const maxStart = new Date((rules.chainNow + rules.maxLeadSec) * 1000);
    if (isAfter(next, maxStart)) {
      next = maxStart;
      return {
        start: next,
        touched: true,
        reason: "Start moved to satisfy maximum lead time.",
      };
    }
  }

  return { start: next, touched: false };
}

export function deriveGatingDeadlines(
  timeline: ChallengeFormState["timeline"],
) {
  const start = timeline.starts;
  const end = timeline.ends;

  let proofDeadline = timeline.proofDeadline ?? null;

  if (start && end) {
    if (!proofDeadline) proofDeadline = addMinutes(end, DEFAULT_PROOF_GRACE_MIN);
    if (proofDeadline && isBefore(proofDeadline, end)) proofDeadline = end;
  }

  return {
    proofRequired: true,
    proofDeadline,
  };
}

export function computeCreateBlockers(
  state: ChallengeFormState,
  rules: ChainRules
) {
  if (rules.paused) {
    return { hard: true as const, reason: "Protocol is paused." };
  }

  if (rules.allowlistEnabled && state.money.currency.type === "ERC20") {
    if (rules.tokenAllowed === false) {
      return {
        hard: true as const,
        reason: "Selected token is not on the allowlist.",
      };
    }
    if (rules.tokenAllowed == null) {
      return {
        hard: true as const,
        reason: "Token allowlist status is unknown.",
      };
    }
  }

  return { hard: false as const, reason: null as string | null };
}

export function validateAgainstContract(
  state: ChallengeFormState,
  rules: ChainRules
) {
  const blockers = computeCreateBlockers(state, rules);
  const gating = deriveGatingDeadlines(state.timeline);

  if (blockers.hard) {
    return {
      ok: false,
      hardReason: blockers.reason,
      reasons: [blockers.reason!],
      gating,
    };
  }

  const reasons: string[] = [];

  const title = (state.essentials.title || "").trim();
  const joinCloses = state.timeline.joinCloses;
  const starts = state.timeline.starts;
  const ends = state.timeline.ends;

  if (!title) reasons.push("Add a challenge name.");
  if (!joinCloses || !starts || !ends) reasons.push("Complete the timeline.");

  const chainNowMs = rules.chainNow * 1000;

  if (joinCloses && joinCloses.getTime() <= chainNowMs) {
    reasons.push("Join close time must still be in the future.");
  }

  if (starts && starts.getTime() <= chainNowMs) {
    reasons.push("Start time must still be in the future.");
  }

  if (joinCloses && starts && !isBefore(joinCloses, starts)) {
    reasons.push("Join closes must be strictly before start.");
  }

  if (joinCloses && starts) {
    const approvalWindowSec = Math.floor(
      (starts.getTime() - joinCloses.getTime()) / 1000
    );
    if (approvalWindowSec < SAFE_APPROVAL_WINDOW_SEC) {
      reasons.push(
        "Keep at least 1 hour between join close and start."
      );
    }
  }

  if (starts && ends) {
    if (!isAfter(ends, starts)) {
      reasons.push("End must be after start.");
    }

    const durSec = Math.floor((ends.getTime() - starts.getTime()) / 1000);
    if (durSec <= 0) reasons.push("Duration must be greater than 0.");

    if (rules.maxDurSec != null && durSec > rules.maxDurSec) {
      reasons.push("Duration exceeds the max allowed by the protocol.");
    }

    const leadSec = Math.floor(starts.getTime() / 1000) - rules.chainNow;
    if (leadSec < requiredLeadSec(rules)) {
      reasons.push("Keep at least 2 hours between now and start.");
    }

    if (
      rules.maxLeadSec != null &&
      rules.maxLeadSec > 0 &&
      leadSec > rules.maxLeadSec
    ) {
      reasons.push("Start is too far in the future.");
    }
  }

  const stake = Number.parseFloat(state.money.stake || "0") || 0;
  if (stake <= 0) {
    reasons.push("Add a stake amount (> 0).");
  }

  if (starts && ends) {
    if (!gating.proofDeadline) {
      reasons.push("Proof deadline is missing.");
    } else if (isBefore(gating.proofDeadline, ends)) {
      reasons.push("Proof deadline must be at or after end.");
    }
  }

  return {
    ok: reasons.length === 0,
    hardReason: null as string | null,
    reasons,
    gating,
  };
}