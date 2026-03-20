// webapp/lib/aivmParams.ts
// -----------------------------------------------------------------------------
// Challenge parameter schemas & builders for all AIVM-compatible kinds
// -----------------------------------------------------------------------------

import { keccak256, toBytes } from "viem";

/* ──────────────────────────────────────────────────────────────────────────
 * Core kinds
 * ────────────────────────────────────────────────────────────────────────── */

export type ChallengeKindKey = "walking" | "running" | "dota" | "cs" | "lol";

/* ──────────────────────────────────────────────────────────────────────────
 * Fitness kinds
 * ────────────────────────────────────────────────────────────────────────── */

export type StepsParams = {
  type: "steps";
  minSteps: number;
  days: number;
};

export type RunningParams = {
  type: "running";
  distanceKm: number;
  deadlineDays: number;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Gaming kinds (base)
 * ────────────────────────────────────────────────────────────────────────── */

export type DotaParams = {
  type: "dota";
  hero?: string;
  kills?: number;
  account?: string;
};

export type CsParams = {
  type: "cs";
  map?: string;
  kills?: number;
  account?: string;
  mode?: "1v1" | "5v5";
};

export type LolParams = {
  type: "lol";
  lane?: string;
  kills?: number;
  account?: string;
  mode?: "1v1" | "5v5";
};

/* ──────────────────────────────────────────────────────────────────────────
 * Gaming templates / meta-rules
 * ────────────────────────────────────────────────────────────────────────── */

export type WinXofYRule = {
  rule: "WIN_X_OF_Y";
  wins: number;
  games: number;
};

export type HeroKillsRule = {
  rule: "HERO_KILLS";
  hero?: string;
  kills: number;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Unified param union
 * ────────────────────────────────────────────────────────────────────────── */

export type AnyParamsBase =
  | StepsParams
  | RunningParams
  | DotaParams
  | CsParams
  | LolParams;

export type AnyParams =
  | AnyParamsBase
  | (AnyParamsBase & Partial<WinXofYRule & HeroKillsRule>);

/* ──────────────────────────────────────────────────────────────────────────
 * Builder
 * ────────────────────────────────────────────────────────────────────────── */

export function buildParams(
  kind: ChallengeKindKey,
  form: Record<string, string | number>
): AnyParams {
  switch (kind) {
    case "walking":
      return {
        type: "steps",
        minSteps: Number(form.minSteps || 0),
        days: Number(form.days || form.deadlineDays || 0),
      };

    case "running":
      return {
        type: "running",
        distanceKm: Number(form.distanceKm || 0),
        deadlineDays: Number(form.deadlineDays || form.days || 0),
      };

    case "dota":
      return {
        type: "dota",
        hero: String(form.hero || "").trim() || undefined,
        kills: Number(form.kills || 0) || undefined,
        account: String(form.account || "").trim() || undefined,
      };

    case "cs":
      return {
        type: "cs",
        map: String(form.map || "").trim() || undefined,
        kills: Number(form.kills || 0) || undefined,
        account: String(form.account || "").trim() || undefined,
        mode: (String(form.mode || "").trim() as "1v1" | "5v5") || undefined,
      };

    case "lol":
      return {
        type: "lol",
        lane: String(form.lane || "").trim() || undefined,
        kills: Number(form.kills || 0) || undefined,
        account: String(form.account || "").trim() || undefined,
        mode: (String(form.mode || "").trim() as "1v1" | "5v5") || undefined,
      };
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hash helper
 * ────────────────────────────────────────────────────────────────────────── */

export function paramsHash(params: AnyParams) {
  // Deterministic keccak hash for registry / signature binding
  return keccak256(toBytes(JSON.stringify(params)));
}

/* ──────────────────────────────────────────────────────────────────────────
 * Notes
 * ──────────────────────────────────────────────────────────────────────────
 * - This module stays side-effect-free; safe to import both server & client.
 * - Extendable: add new ChallengeKindKey and shape, then augment AnyParamsBase.
 * - AIVM adapters should deserialize this JSON directly.
 * - The rule layer (WinXofY / HeroKills) is optional; if absent,
 *   base params describe the primary challenge.
 * ────────────────────────────────────────────────────────────────────────── */