/**
 * offchain/evaluators/gamingEvaluator.ts
 *
 * Evaluates gaming evidence (OpenDota, Riot/LoL, Steam, FACEIT) against
 * challenge-specific gaming thresholds.
 *
 * Supports two evaluation modes:
 *   - Threshold (default): Evidence must meet minWins / streakLength to pass.
 *   - Competitive: All valid evidence passes; a numeric score (kills, wins,
 *     assists, etc.) is computed for ranking. The competitive ranking step
 *     (in challengeDispatcher) later determines top-N winners.
 *
 * Gaming Rule fields (all optional — absent means "no filter"):
 *   minWins    — minimum number of qualifying wins required (default: 1)
 *   hero       — required hero / champion name (case-insensitive substring)
 *   rankedOnly — when true, only count ranked matches
 *   period     — { start: ISO, end: ISO } time window filter
 *   streakLength — consecutive wins required
 *   mode       — "competitive" for ranked challenges
 *   competitiveMetric — which metric to score on ("wins", "kills", "assists", "kda")
 */

import type { Evaluator, EvaluationResult, EvidenceRow, ChallengeConfig } from "./types";

const GAMING_PROVIDERS = ["opendota", "riot", "steam", "faceit"] as const;

// ─── Gaming Rule type ────────────────────────────────────────────────────────

type GamingRule = {
  minWins?: number;
  hero?: string;
  rankedOnly?: boolean;
  period?: { start: string; end: string };
  streakLength?: number;
  mode?: string;
  competitiveMetric?: string;
};

// ─── Rule extraction ──────────────────────────────────────────────────────────

function parseMaybeJson(v: unknown): unknown {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

/**
 * A gaming rule is detected when the params object has at least one of
 * minWins / hero / rankedOnly / period — and does NOT have challengeType
 * (which is the fitness-rule discriminator).
 */
function isGamingRule(v: unknown): v is GamingRule {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  if ("challengeType" in obj) return false; // fitness rule
  return "minWins" in obj || "hero" in obj || "rankedOnly" in obj || "period" in obj || "streakLength" in obj || "mode" in obj;
}

function extractGamingRule(cfg: ChallengeConfig | null | undefined): GamingRule | null {
  if (!cfg) return null;

  const proofParams = parseMaybeJson((cfg.proof as any)?.params);

  for (const candidate of [
    (proofParams as any)?.rule,
    proofParams,
    (cfg.params as any)?.rule,
    cfg.params,
  ]) {
    const rule = parseMaybeJson(candidate);
    if (isGamingRule(rule)) return rule;
  }

  return null;
}

// ─── Record helpers ───────────────────────────────────────────────────────────

function isWin(record: unknown): boolean {
  if (typeof record !== "object" || record === null) return false;
  const r = record as Record<string, unknown>;
  return r.result_for_player === "win" || r.team_result === "win" || r.win === true;
}

function isRanked(record: unknown): boolean {
  if (typeof record !== "object" || record === null) return false;
  const r = record as Record<string, unknown>;
  if (r.lobby_type === 7) return true;
  if (typeof r.queue_type === "string" && r.queue_type.toUpperCase().includes("RANKED")) return true;
  if (r.ranked === true) return true;
  return false;
}

function matchesHero(record: unknown, hero: string): boolean {
  if (typeof record !== "object" || record === null) return false;
  const r = record as Record<string, unknown>;
  const needle = hero.toLowerCase();
  for (const field of ["hero_name", "hero", "champion"]) {
    if (typeof r[field] === "string" && (r[field] as string).toLowerCase().includes(needle)) return true;
  }
  return false;
}

function recordTimestampMs(record: unknown): number | null {
  if (typeof record !== "object" || record === null) return null;
  const r = record as Record<string, unknown>;

  for (const field of ["start", "match_date"]) {
    if (typeof r[field] === "string") {
      const ms = Date.parse(r[field] as string);
      if (!isNaN(ms)) return ms;
    }
  }
  if (typeof r.game_creation === "number") return r.game_creation;
  if (typeof r.start_time === "number") return r.start_time * 1000;

  return null;
}

function inPeriod(record: unknown, period: { start: string; end: string }): boolean {
  const ts = recordTimestampMs(record);
  if (ts === null) return true;
  const lo = Date.parse(period.start);
  const hi = Date.parse(period.end);
  return ts >= lo && ts <= hi;
}

/** Extract a numeric field from a record (kills, assists, deaths, damage). */
function numericField(record: unknown, ...fields: string[]): number {
  if (typeof record !== "object" || record === null) return 0;
  const r = record as Record<string, unknown>;
  for (const f of fields) {
    if (typeof r[f] === "number") return r[f] as number;
  }
  return 0;
}

// ─── Competitive scoring ──────────────────────────────────────────────────────

/**
 * Compute a competitive score for gaming records based on the metric.
 * Supports: wins, kills, assists, kda, damage.
 */
function computeGamingScore(
  eligible: unknown[],
  metric: string
): number {
  const sumField = (...fields: string[]) =>
    eligible.reduce<number>((sum, r) => sum + numericField(r, ...fields), 0);

  switch (metric) {
    case "wins":
      return eligible.filter(isWin).length;
    case "kills":
      return sumField("kills", "kill_count");
    case "assists":
      return sumField("assists", "assist_count");
    case "deaths":
      return sumField("deaths", "death_count");
    case "kda": {
      const kills = sumField("kills", "kill_count");
      const deaths = sumField("deaths", "death_count");
      const assists = sumField("assists", "assist_count");
      return deaths === 0 ? kills + assists : (kills + assists) / deaths;
    }
    case "damage":
      return sumField("hero_damage", "damage_dealt", "total_damage_dealt");
    default:
      return eligible.filter(isWin).length;
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

export const gamingEvaluator: Evaluator = {
  providers: GAMING_PROVIDERS,

  async evaluate(
    evidence: EvidenceRow,
    challengeConfig?: ChallengeConfig | null
  ): Promise<EvaluationResult> {
    const records = Array.isArray(evidence.data) ? evidence.data : [];

    if (records.length === 0) {
      return { verdict: false, reasons: ["No game records in evidence"] };
    }

    const rule = extractGamingRule(challengeConfig);

    // ── Real rule evaluation ─────────────────────────────────────────────────
    if (rule) {
      let eligible = records as unknown[];

      // Time window filter
      if (rule.period) {
        eligible = eligible.filter((r) => inPeriod(r, rule.period!));
      }

      // Ranked filter
      if (rule.rankedOnly) {
        eligible = eligible.filter(isRanked);
      }

      // Hero / champion filter
      if (rule.hero) {
        eligible = eligible.filter((r) => matchesHero(r, rule.hero!));
      }

      const wins = eligible.filter(isWin).length;

      // ── Competitive mode: compute score, always pass ────────────────────
      if (rule.mode === "competitive") {
        const metric = rule.competitiveMetric ?? "wins";
        const score = computeGamingScore(eligible, metric);
        return {
          verdict: true,
          reasons: [],
          score,
          metadata: {
            mode: "competitive",
            metric,
            totalRecords: records.length,
            eligibleRecords: eligible.length,
            wins,
            hero: rule.hero ?? null,
            rankedOnly: rule.rankedOnly ?? false,
          },
        };
      }

      // ── Win streak evaluation ──────────────────────────────────────────────
      if (rule.streakLength && rule.streakLength > 0) {
        const sorted = [...eligible].sort((a, b) => {
          const tsA = recordTimestampMs(a) ?? 0;
          const tsB = recordTimestampMs(b) ?? 0;
          return tsA - tsB;
        });
        let maxStreak = 0;
        let currentStreak = 0;
        for (const r of sorted) {
          if (isWin(r)) {
            currentStreak++;
            if (currentStreak > maxStreak) maxStreak = currentStreak;
          } else {
            currentStreak = 0;
          }
        }
        const passed = maxStreak >= rule.streakLength;
        return {
          verdict: passed,
          reasons: passed ? [] : [`Best win streak: ${maxStreak}/${rule.streakLength}`],
          score: maxStreak,
          metadata: {
            totalRecords: records.length,
            eligibleRecords: eligible.length,
            wins,
            maxStreak,
            requiredStreak: rule.streakLength,
            rankedOnly: rule.rankedOnly ?? false,
          },
        };
      }

      // ── Threshold mode ────────────────────────────────────────────────────
      const minWins = rule.minWins ?? 1;

      if (wins < minWins) {
        const reasons: string[] = [
          `Qualifying wins: ${wins}/${minWins}` +
            (rule.rankedOnly ? " (ranked only)" : "") +
            (rule.hero ? ` (hero: ${rule.hero})` : "") +
            (rule.period ? ` (within period)` : ""),
        ];
        return {
          verdict: false,
          reasons,
          score: wins,
          metadata: {
            totalRecords: records.length,
            eligibleRecords: eligible.length,
            wins,
            minWins,
            hero: rule.hero ?? null,
            rankedOnly: rule.rankedOnly ?? false,
          },
        };
      }

      return {
        verdict: true,
        reasons: [],
        score: wins,
        metadata: {
          totalRecords: records.length,
          eligibleRecords: eligible.length,
          wins,
          minWins,
          hero: rule.hero ?? null,
          rankedOnly: rule.rankedOnly ?? false,
        },
      };
    }

    // ── Structural pass fallback (no rule config available) ───────────────────
    const wins   = records.filter(isWin).length;
    const losses = records.filter((r) => {
      if (typeof r !== "object" || r === null) return false;
      const rec = r as Record<string, unknown>;
      return rec.result_for_player === "loss" || rec.team_result === "loss" || rec.win === false;
    }).length;
    const other = records.length - wins - losses;

    if (wins === 0) {
      return {
        verdict: false,
        reasons: [`No winning records found in evidence (records: ${records.length}, losses: ${losses})`],
        score: 0,
        metadata: { totalRecords: records.length, wins: 0, losses, other },
      };
    }

    return {
      verdict: true,
      reasons: [],
      score: wins,
      metadata: {
        totalRecords: records.length,
        wins,
        losses,
        other,
        note: "No challenge gaming rule config found — structural pass applied",
      },
    };
  },
};
