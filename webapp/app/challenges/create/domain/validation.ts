import type { ChallengeFormState } from "../state/types";
import { isValidDate } from "./time";
import { safeNum } from "./money";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateSchedule(state: ChallengeFormState): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const joinCloses = state.timeline?.joinCloses ?? null;
  const starts = state.timeline?.starts ?? null;
  const ends = state.timeline?.ends ?? null;

  if (!isValidDate(joinCloses)) errors.push("Join close time is missing.");
  if (!isValidDate(starts)) errors.push("Start time is missing.");
  if (!isValidDate(ends)) errors.push("End time is missing.");

  if (isValidDate(joinCloses) && isValidDate(starts) && joinCloses.getTime() >= starts.getTime()) {
    errors.push("Join close must be before start.");
  }
  if (isValidDate(starts) && isValidDate(ends) && starts.getTime() >= ends.getTime()) {
    errors.push("Start must be before end.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateFunds(state: ChallengeFormState): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stake = safeNum(state.money?.stake);

  if (stake <= 0) errors.push("Stake must be greater than 0.");
  if (stake < 0) errors.push("Stake cannot be negative.");

  return { ok: errors.length === 0, errors, warnings };
}