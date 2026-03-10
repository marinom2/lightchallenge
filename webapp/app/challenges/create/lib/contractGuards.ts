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

  autoApprovalSet: boolean;
  allowlistEnabled: boolean | null;
  tokenAllowed: boolean | null;

  strategyPaused?: boolean | null;
  strategyRequireCreatorAllowlist?: boolean | null;
  strategyCreatorAllowed?: boolean | null;
  strategyAllowNative?: boolean | null;
  strategyMinLeadSec?: number | null;
  strategyMaxDurSec?: number | null;
};

export const DEFAULT_PROOF_GRACE_MIN = 60;
export const DEFAULT_PEER_GRACE_MIN = 60;

function requiredLeadSec(rules: ChainRules) {
  return Math.max(
    rules.minLeadSec || 0,
    rules.strategyMinLeadSec || 0,
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
  state: ChallengeFormState
) {
  const start = timeline.starts;
  const end = timeline.ends;
  const peerGateEnabled = Number(state.peerApprovalsNeeded ?? 0) > 0;

  let proofDeadline = timeline.proofDeadline ?? null;
  let peerDeadline = timeline.peerDeadline ?? null;

  if (start && end) {
    if (!proofDeadline) proofDeadline = addMinutes(end, DEFAULT_PROOF_GRACE_MIN);
    if (peerGateEnabled && !peerDeadline) {
      peerDeadline = addMinutes(end, DEFAULT_PEER_GRACE_MIN);
    }

    if (proofDeadline && isBefore(proofDeadline, end)) proofDeadline = end;
    if (peerGateEnabled && peerDeadline && isBefore(peerDeadline, end)) {
      peerDeadline = end;
    }
  }

  return {
    proofRequired: true,
    peerGateEnabled,
    proofDeadline,
    peerDeadline,
  };
}

export function computeCreateBlockers(
  state: ChallengeFormState,
  rules: ChainRules
) {
  if (rules.paused) {
    return { hard: true as const, reason: "Protocol is paused." };
  }

  if (!rules.autoApprovalSet) {
    return {
      hard: true as const,
      reason: "Auto-approval strategy is not configured.",
    };
  }

  if (rules.strategyPaused) {
    return {
      hard: true as const,
      reason: "Auto-approval strategy is paused.",
    };
  }

  if (
    rules.strategyRequireCreatorAllowlist &&
    rules.strategyCreatorAllowed === false
  ) {
    return {
      hard: true as const,
      reason: "Your wallet is not allowed by the auto-approval strategy.",
    };
  }

  if (
    state.money.currency.type === "NATIVE" &&
    rules.strategyAllowNative === false
  ) {
    return {
      hard: true as const,
      reason: "Native currency is not allowed by the auto-approval strategy.",
    };
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
  const gating = deriveGatingDeadlines(state.timeline, state);

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

    if (
      rules.strategyMaxDurSec != null &&
      durSec > rules.strategyMaxDurSec
    ) {
      reasons.push("Duration exceeds the auto-approval strategy max duration.");
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
  const bond = Number.parseFloat(state.money.bond || "0") || 0;
  if (stake + bond <= 0) {
    reasons.push("Add stake and/or proposal bond (> 0).");
  }

  const approvalsNeeded = Number(state.peerApprovalsNeeded ?? 0);
  if (approvalsNeeded > 0 && (state.peers?.length ?? 0) < approvalsNeeded) {
    reasons.push("Peer approvals needed exceeds number of peers.");
  }

  if (starts && ends) {
    if (!gating.proofDeadline) {
      reasons.push("Proof deadline is missing.");
    } else if (isBefore(gating.proofDeadline, ends)) {
      reasons.push("Proof deadline must be at or after end.");
    }

    if (gating.peerGateEnabled) {
      if (!gating.peerDeadline) {
        reasons.push("Peer deadline is missing.");
      } else if (isBefore(gating.peerDeadline, ends)) {
        reasons.push("Peer deadline must be at or after end.");
      }
    }
  }

  return {
    ok: reasons.length === 0,
    hardReason: null as string | null,
    reasons,
    gating,
  };
}