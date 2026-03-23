/**
 * offchain/engine/achievementRules.ts
 *
 * Pure qualification logic for special achievements.
 * Each rule takes DB stats and returns whether the achievement should be awarded.
 * No database calls — callers pass in the data.
 */

import type { AchievementType } from "../db/achievements";

// ── Types ────────────────────────────────────────────────────────────────────

export type ParticipantStats = {
  wallet: string;
  challengeId: string;
  /** Did this participant win the current challenge? */
  isWinner: boolean;
  /** Did this participant complete (submit proof for) the current challenge? */
  isCompleter: boolean;
  /** Total victories for this wallet across all challenges (including current). */
  totalVictories: number;
  /** Total challenges participated in (including current). */
  totalParticipations: number;
  /** Total challenges completed (including current). */
  totalCompletions: number;
  /** The challenge ID number (for early_adopter check). */
  challengeIdNumber: number;
  /** Already-awarded achievement types for this (wallet, challengeId). */
  existingAwards: Set<string>;
};

export type AwardCandidate = {
  achievementType: AchievementType;
  wallet: string;
  challengeId: string;
};

// ── Rules ────────────────────────────────────────────────────────────────────

type Rule = {
  type: AchievementType;
  check: (stats: ParticipantStats) => boolean;
};

const RULES: Rule[] = [
  {
    // First ever victory for this wallet
    type: "first_win",
    check: (s) => s.isWinner && s.totalVictories === 1,
  },
  {
    // Participation milestones: 5, 10, 25, 50 challenges
    type: "participation",
    check: (s) => [5, 10, 25, 50].includes(s.totalParticipations),
  },
  {
    // Veteran milestones: 10, 25, 50 completions
    type: "veteran",
    check: (s) => s.isCompleter && [10, 25, 50].includes(s.totalCompletions),
  },
  {
    // Early adopter: participated in challenge with ID <= 10
    type: "early_adopter",
    check: (s) => s.challengeIdNumber <= 10,
  },
];

// ── Evaluate ─────────────────────────────────────────────────────────────────

/**
 * Evaluate all rules for a participant on a finalized challenge.
 * Returns a list of achievements to award (excluding any already awarded).
 */
export function evaluateRules(stats: ParticipantStats): AwardCandidate[] {
  const candidates: AwardCandidate[] = [];

  for (const rule of RULES) {
    // Skip if already awarded for this (wallet, challenge, type)
    if (stats.existingAwards.has(rule.type)) continue;

    if (rule.check(stats)) {
      candidates.push({
        achievementType: rule.type,
        wallet: stats.wallet,
        challengeId: stats.challengeId,
      });
    }
  }

  return candidates;
}
