// webapp/lib/aivm/compose.ts
import type { ChallengeFormState } from "@/app/challenges/create/state/types";
import { getTemplateById } from "@/lib/templates";
import { paramsHash } from "@/lib/aivmParams";
import type { AnyParams } from "@/lib/aivmParams";

export type ComposedModel = {
  modelId: string;
  params: Record<string, any>;
  paramsHashHex: `0x${string}`;
};

function getTemplateIdFromState(state: ChallengeFormState): string | null {
  const aivmForm = (state as any)?.aivmForm;
  const templateId = aivmForm?.templateId;
  return typeof templateId === "string" && templateId.length > 0 ? templateId : null;
}

export function composeModelFromState(state: ChallengeFormState): ComposedModel | null {
  const templateId = getTemplateIdFromState(state);
  if (!templateId) return null;

  const tpl = getTemplateById(templateId);
  if (!tpl) return null;

  const params = tpl.paramsBuilder({ state }) as unknown as AnyParams;
  const paramsHashHex = paramsHash(params) as `0x${string}`;

  return {
    modelId: tpl.modelId,
    params: params as unknown as Record<string, any>,
    paramsHashHex,
  };
}