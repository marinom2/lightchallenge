// webapp/app/challenges/create/state/validation.ts
import { isAddress } from "viem";
import type { ChallengeFormState } from "./types";
import { CHALLENGE_KINDS } from "@/lib/challengeKinds";
import {
  getTemplateByIdSync,
  resolveTemplateFieldOptions,
} from "@/lib/templateRegistry";
import {
  SAFE_APPROVAL_WINDOW_SEC,
  SAFE_MIN_LEAD_SEC,
} from "../lib/constants";

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function toNum(v: unknown): number {
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function isBlank(v: unknown): boolean {
  return String(v ?? "").trim() === "";
}

function resolveSelectedKindKey(state: ChallengeFormState): string | null {
  if (state.intent.type === "FITNESS") return state.intent.fitnessKind ?? null;
  if (state.intent.type === "GAMING") return state.intent.gameId ?? null;
  return null;
}

function getSupportedIntentKinds(): Set<string> {
  return new Set(CHALLENGE_KINDS.map((k) => String(k.key)));
}

function validateTemplateRequirements(
  state: ChallengeFormState,
  errors: Record<string, string>
) {
  const mode = state.verification.mode;
  if (mode !== "AIVM") return;

  const formTemplateId = state.aivmForm?.templateId ?? null;
  const verificationTemplateId = state.verification.templateId ?? null;
  const templateId = formTemplateId ?? verificationTemplateId;

  if (!templateId) {
    errors["verification.templateId"] = "Select a template.";
    return;
  }

  if (
    formTemplateId &&
    verificationTemplateId &&
    formTemplateId !== verificationTemplateId
  ) {
    errors["verification.templateSync"] =
      "Template selection is out of sync. Re-select the template.";
  }

  const tpl = getTemplateByIdSync(templateId);
  if (!tpl) {
    errors["verification.templateId"] =
      "Selected template could not be resolved.";
    return;
  }

  const selectedKind = resolveSelectedKindKey(state);
  if (selectedKind && tpl.kind !== selectedKind) {
    errors["verification.templateKind"] =
      `Selected template does not match the chosen challenge kind (${selectedKind}).`;
  }

  if (state.verification.modelId && tpl.modelId !== state.verification.modelId) {
    errors["verification.modelSync"] =
      "Resolved model does not match the selected template. Re-select the template.";
  }

  for (const field of tpl.fields) {
    if (field.kind === "readonly") continue;

    const raw = state.aivmForm?.[field.key];

    if (field.kind === "number") {
      if (isBlank(raw)) {
        errors[`aivmForm.${field.key}`] = `${field.label} is required.`;
        continue;
      }

      const num = Number(raw);
      if (!Number.isFinite(num)) {
        errors[`aivmForm.${field.key}`] = `${field.label} must be a number.`;
        continue;
      }

      if (field.min != null && num < field.min) {
        errors[`aivmForm.${field.key}`] =
          `${field.label} must be at least ${field.min}.`;
      }
      continue;
    }

    if (field.kind === "text") {
      if (isBlank(raw)) {
        errors[`aivmForm.${field.key}`] = `${field.label} is required.`;
      }
      continue;
    }

    if (field.kind === "select") {
      if (isBlank(raw)) {
        errors[`aivmForm.${field.key}`] = `${field.label} is required.`;
        continue;
      }

      const options = resolveTemplateFieldOptions(field, state);
      if (options.length > 0) {
        const allowed = new Set(options.map((o) => o.value));
        if (!allowed.has(String(raw))) {
          errors[`aivmForm.${field.key}`] =
            `${field.label} must be one of the allowed options.`;
        }
      }
    }
  }
}

export function validateState(state: ChallengeFormState): Record<string, string> {
  const errors: Record<string, string> = {};

  const mode = state.verification.mode;
  const backend = state.verification.backend;

  if (!state.intent.type) {
    errors["intent.type"] = "Pick a challenge type.";
  }

  if (state.intent.type === "GAMING" && !state.intent.gameId) {
    errors["intent.gameId"] = "Pick a game.";
  }

  if (state.intent.type === "FITNESS" && !state.intent.fitnessKind) {
    errors["intent.fitnessKind"] = "Pick a fitness type.";
  }

  const selectedKindKey = resolveSelectedKindKey(state);
  if (selectedKindKey && !getSupportedIntentKinds().has(selectedKindKey)) {
    errors["intent.kindUnsupported"] =
      `This challenge kind is not supported right now: ${selectedKindKey}.`;
  }

  const title = (state.essentials.title || "").trim();
  if (!title) {
    errors["essentials.title"] = "Add a title.";
  }

  const stake = toNum(state.money.stake);

  if (stake < 0) errors["money.stake"] = "Stake cannot be negative.";
  if (stake <= 0) {
    errors["money.total"] = "Stake must be greater than 0.";
  }

  if (state.money.currency.type === "ERC20") {
    const addr = state.money.currency.address;
    if (!addr || !isAddress(String(addr))) {
      errors["money.currency.address"] = "Token address is required.";
    }
  }

  const { joinCloses, starts, ends, proofDeadline } = state.timeline;
  const now = Date.now();

  if (!isValidDate(joinCloses)) {
    errors["timeline.joinCloses"] = "Join close time is required.";
  }
  if (!isValidDate(starts)) {
    errors["timeline.starts"] = "Start time is required.";
  }
  if (!isValidDate(ends)) {
    errors["timeline.ends"] = "End time is required.";
  }

  if (isValidDate(joinCloses) && joinCloses.getTime() <= now) {
    errors["timeline.joinCloses.future"] =
      "Join close time must be in the future.";
  }

  if (isValidDate(starts) && starts.getTime() <= now) {
    errors["timeline.starts.future"] = "Start time must be in the future.";
  }

  if (isValidDate(joinCloses) && isValidDate(starts)) {
    if (starts.getTime() <= joinCloses.getTime()) {
      errors["timeline.order"] = "Start must be after join closes.";
    }

    const approvalWindowSec = Math.floor(
      (starts.getTime() - joinCloses.getTime()) / 1000
    );

    if (approvalWindowSec < SAFE_APPROVAL_WINDOW_SEC) {
      errors["timeline.approvalWindow"] =
        "Keep at least 1 hour between join close and start.";
    }
  }

  if (isValidDate(starts)) {
    const leadSec = Math.floor((starts.getTime() - now) / 1000);
    if (leadSec < SAFE_MIN_LEAD_SEC) {
      errors["timeline.minLead"] =
        "Keep at least 2 hours between now and start.";
    }
  }

  if (isValidDate(starts) && isValidDate(ends) && ends.getTime() <= starts.getTime()) {
    errors["timeline.order2"] = "End must be after start.";
  }

  if (!isValidDate(proofDeadline)) {
    errors["timeline.proofDeadline"] = "Proof deadline is required.";
  } else if (isValidDate(ends) && proofDeadline.getTime() < ends.getTime()) {
    errors["timeline.proofDeadline2"] =
      "Proof deadline must be on or after end time.";
  }

  validateTemplateRequirements(state, errors);

  if (!state.verification.verifier || !isAddress(String(state.verification.verifier))) {
    if (mode === "AIVM") {
      errors["verification.verifier"] =
        "Verifier could not be resolved yet. Check the selected template/model.";
    } else {
      errors["verification.verifier"] =
        "Verifier is required for this verification mode.";
    }
  }

  if (mode === "AIVM") {
    const templateId =
      state.aivmForm?.templateId ?? state.verification.templateId ?? null;

    if (!templateId) {
      errors["verification.templateId"] =
        "A template is required for AIVM verification.";
    }

    if (!state.verification.modelId) {
      errors["verification.modelId"] =
        "Model ID could not be resolved from the selected template.";
    }

    if (!state.verification.modelHash) {
      errors["verification.modelHash"] =
        "Model hash could not be resolved from registry.";
    }

    if (backend !== "LIGHTCHAIN_POI") {
      errors["verification.backend"] =
        "AIVM challenges must use Lightchain PoI settlement in this flow.";
    }
  } else {
    if (state.aivmForm?.templateId || state.verification.templateId) {
      errors["verification.templateMode"] =
        "Templates are only used for AIVM verification.";
    }

    if (state.verification.modelId || state.verification.modelHash) {
      errors["verification.modelMode"] =
        "Model selection is only used for AIVM verification.";
    }
  }

  return errors;
}