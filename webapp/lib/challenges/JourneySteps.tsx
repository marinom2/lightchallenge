// webapp/lib/challenges/JourneySteps.tsx
"use client";

import type { ResolvedLifecycle, LifecycleStage } from "./lifecycle";

/**
 * Horizontal step indicator showing where a participant is in the challenge lifecycle.
 *
 * Usage:
 *   <JourneySteps lifecycle={lc} />
 *   <JourneySteps lifecycle={lc} compact />
 */

type Step = {
  key: string;
  label: string;
  /** Stages that mark this step as "current". */
  stages: LifecycleStage[];
};

const STEPS: Step[] = [
  { key: "joined",  label: "Joined",   stages: ["ACTIVE"] },
  { key: "proof",   label: "Proof",    stages: ["NEEDS_PROOF", "NEEDS_PROOF_URGENT"] },
  { key: "review",  label: "Review",   stages: ["SUBMITTED", "VERIFIED"] },
  { key: "result",  label: "Result",   stages: ["PASSED", "FAILED", "REWARD_EARNED"] },
  { key: "claim",   label: "Claim",    stages: ["CLAIMABLE", "CLAIMED"] },
];

/** Ordinal of a stage within the journey (0-based). */
function stageOrdinal(stage: LifecycleStage): number {
  for (let i = 0; i < STEPS.length; i++) {
    if (STEPS[i].stages.includes(stage)) return i;
  }
  return -1; // ENDED or unknown
}

export default function JourneySteps({
  lifecycle,
  compact,
}: {
  lifecycle: ResolvedLifecycle;
  compact?: boolean;
}) {
  const current = stageOrdinal(lifecycle.stage);
  const isFailed = lifecycle.isFailed;
  const isEnded = lifecycle.isEnded;

  // Don't render for ended/missed challenges — no meaningful journey
  if (isEnded) return null;

  return (
    <div className={`journey-steps ${compact ? "journey-steps--compact" : ""}`}>
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const failed = active && isFailed;

        return (
          <div
            key={step.key}
            className="journey-step"
            data-done={done || undefined}
            data-active={active || undefined}
            data-failed={failed || undefined}
          >
            <div className="journey-step__dot" />
            {!compact && <span className="journey-step__label">{step.label}</span>}
            {i < STEPS.length - 1 && <div className="journey-step__line" />}
          </div>
        );
      })}
    </div>
  );
}
