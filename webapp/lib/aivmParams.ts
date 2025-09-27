// webapp/lib/aivmParams.ts
import { keccak256, toBytes } from "viem";
import type { ChallengeKindKey } from "./challengeKinds";

export type StepsParams = { type: "steps"; minSteps: number; days: number };
export type RunningParams = { type: "running"; distanceKm: number; deadlineDays: number };
export type DotaParams = { type: "dota"; hero: string; kills: number; account: string };
export type AnyParams = StepsParams | RunningParams | DotaParams;

export function buildParams(kind: ChallengeKindKey, form: Record<string, string | number>): AnyParams {
  switch (kind) {
    case "steps":
      return {
        type: "steps",
        minSteps: Number(form.minSteps || 0),
        days: Number(form.days || 0),
      };
    case "running":
      return {
        type: "running",
        distanceKm: Number(form.distanceKm || 0),
        deadlineDays: Number(form.deadlineDays || 0),
      };
    case "dota":
      return {
        type: "dota",
        hero: String(form.hero || "").trim(),
        kills: Number(form.kills || 0),
        account: String(form.account || "").trim(),
      };
  }
}

export function paramsHash(params: AnyParams) {
  // Canonical stringify (no spaces, sorted fields implicitly by our fixed shape)
  const json = JSON.stringify(params);
  return keccak256(toBytes(json));
}