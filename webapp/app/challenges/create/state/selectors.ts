// webapp/app/challenges/create/state/selectors.ts
import type { Address } from "viem";
import { formatUnits, isAddress, parseUnits } from "viem";
import type { ChallengeFormState, DerivedState } from "./types";
import { validateState } from "./validation";
import { getTemplateByIdSync } from "@/lib/templateRegistry";

/**
 * Normalize decimals (native defaults to 18).
 */
function getDecimals(state: ChallengeFormState): number {
  if (state.money.currency.type === "NATIVE") {
    return state.money.currency.decimals ?? 18;
  }
  return state.money.currency.decimals ?? 18;
}

function safeParse(amount: string, decimals: number): bigint {
  try {
    const a = String(amount ?? "0").trim();
    if (!a) return 0n;
    return parseUnits(a as `${number}`, decimals);
  } catch {
    return 0n;
  }
}

export function selectVerifier(state: ChallengeFormState): Address | null {
  const v = state.verification.verifier;
  if (!v) return null;
  return isAddress(String(v)) ? (v as Address) : null;
}

export function buildDerivedState(state: ChallengeFormState): DerivedState {
  const decimals = getDecimals(state);

  const totalDepositWei = safeParse(state.money.stake, decimals);

  const totalDepositFormatted = (() => {
    try {
      return formatUnits(totalDepositWei, decimals);
    } catch {
      return "0";
    }
  })();

  const verifier = selectVerifier(state);

  const templateId =
    state.aivmForm?.templateId ?? state.verification.templateId ?? null;
  const template = templateId ? getTemplateByIdSync(templateId) : null;

  const modelId = state.verification.modelId ?? template?.modelId ?? null;

  const resolvedKind =
    template?.kind ??
    (state.intent.type === "FITNESS"
      ? state.intent.fitnessKind ?? null
      : state.intent.type === "GAMING"
      ? state.intent.gameId ?? null
      : null);

  const errors = validateState(state);

  return {
    totalDepositWei,
    totalDepositFormatted,
    verifier,
    verifierSource: verifier ? "state" : "missing",
    modelId,
    resolvedKind,
    errors,
  };
}