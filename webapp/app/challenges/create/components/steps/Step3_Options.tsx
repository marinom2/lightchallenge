"use client";

import * as React from "react";
import { Info, ShieldCheck, Sparkles, CheckCircle2 } from "lucide-react";
import { isAddress } from "viem";

import type {
  ChallengeFormState,
  Action,
  VerificationStyle,
} from "../../state/types";

import {
  buildTemplateDefaultFormState,
  ensureTemplateRegistryLoaded,
  getTemplateByIdSync,
  getTemplatesForIntentSync,
  resolveTemplateFieldOptions,
  type TemplateRegistryEntry,
} from "@/lib/templateRegistry";
import { getModelFromRegistry } from "@/lib/modelRegistry";
import deploymentData from "@/public/deployments/lightchain.json";
import {
  type VerificationBackend,
} from "../../lib/proof";
import {
  buildCanonicalAivmParamsPayload,
  buildCanonicalAivmParamsHash,
} from "@/lib/challengeProofFlow";

type DeploymentContracts = {
  ChallengePayAivmPoiVerifier?: string;
  ChallengeTaskRegistry?: string;
  AIVMInferenceV2?: string;
};

const DEPLOYED_CONTRACTS: DeploymentContracts =
  (deploymentData as { contracts?: DeploymentContracts })?.contracts ?? {};

const FIXED_MODE = "AIVM" as const;
const FIXED_BACKEND: VerificationBackend = "LIGHTCHAIN_POI";

function getDefaultAivmPoiVerifier(): string | null {
  return DEPLOYED_CONTRACTS.ChallengePayAivmPoiVerifier ?? null;
}

function shallowEqualRecord(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/* ── Template requirement fields ── */

function TemplateRequirements({
  template,
  state,
  dispatch,
}: {
  template: TemplateRegistryEntry | null;
  state: ChallengeFormState;
  dispatch: React.Dispatch<Action>;
}) {
  if (!template) return null;

  const setField = (key: string, value: unknown) => {
    dispatch({ type: "SET_AIVM_FORM", payload: { [key]: value } });
  };

  const editableFields = template.fields.filter((f) => f.kind !== "readonly");
  if (editableFields.length === 0) return null;

  return (
    <div className="cw-requirements">
      <div className="cw-requirements__header">
        <Sparkles size={14} />
        <span>Challenge parameters</span>
      </div>

      <div className="cw-requirements__grid">
        {editableFields.map((field) => {
          const raw = state.aivmForm?.[field.key];

          if (field.kind === "number") {
            return (
              <label key={field.key} className="cw-field">
                <span className="cw-field__label">{field.label}</span>
                <input
                  className="input"
                  type="number"
                  min={field.min}
                  step={field.step ?? 1}
                  value={raw == null ? "" : String(raw)}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.default != null ? String(field.default) : ""}
                />
              </label>
            );
          }

          if (field.kind === "text") {
            return (
              <label key={field.key} className="cw-field">
                <span className="cw-field__label">{field.label}</span>
                <input
                  className="input"
                  value={raw == null ? "" : String(raw)}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.default ?? ""}
                />
              </label>
            );
          }

          if (field.kind === "select") {
            const options = resolveTemplateFieldOptions(field, state);

            if (options.length > 0) {
              return (
                <label key={field.key} className="cw-field">
                  <span className="cw-field__label">{field.label}</span>
                  <select
                    className="input"
                    value={raw == null ? "" : String(raw)}
                    onChange={(e) => setField(field.key, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {options.map((opt) => (
                      <option key={`${field.key}:${opt.value}`} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            return (
              <label key={field.key} className="cw-field">
                <span className="cw-field__label">{field.label}</span>
                <input
                  className="input"
                  value={raw == null ? "" : String(raw)}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder="Enter value"
                />
              </label>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

/* ── Settlement info tooltip ── */

function SettlementTooltip() {
  const [open, setOpen] = React.useState(false);

  return (
    <span className="cw-info-tip">
      <button
        type="button"
        className="cw-info-tip__trigger"
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="How settlement works"
      >
        <Info size={14} />
      </button>

      {open ? (
        <span className="cw-info-tip__bubble" role="tooltip">
          Results are verified through Lightchain&apos;s decentralized AI network.
          The settlement lifecycle: request → commit → reveal → PoI attestation → finalize.
        </span>
      ) : null}
    </span>
  );
}

/* ── Main component ── */

export default function Step3_Options({
  state,
  dispatch,
}: {
  state: ChallengeFormState;
  dispatch: React.Dispatch<Action>;
}) {
  const style = (state.verification.style ?? "SIMPLE") as VerificationStyle;

  const templateId =
    state.aivmForm?.templateId ?? state.verification.templateId ?? "";
  const verifier = state.verification.verifier ?? null;

  const [registryReady, setRegistryReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    ensureTemplateRegistryLoaded()
      .then(() => { if (alive) setRegistryReady(true); })
      .catch(() => { if (alive) setRegistryReady(true); });
    return () => { alive = false; };
  }, []);

  const templates = React.useMemo(() => {
    return getTemplatesForIntentSync({
      type: (state.intent.type ?? "GAMING") as "FITNESS" | "GAMING",
      gameId: (state.intent.gameId ?? null) as any,
      gameMode: state.intent.gameMode ?? null,
      fitnessKind: (state.intent.fitnessKind ?? null) as any,
    });
  }, [registryReady, state.intent]);

  const selectedTemplate = React.useMemo(() => {
    if (!templateId) return null;
    return getTemplateByIdSync(templateId);
  }, [registryReady, templateId]);

  const deployedDefaultVerifier = React.useMemo(
    () => getDefaultAivmPoiVerifier(),
    []
  );

  const verifierValid = !!verifier && isAddress(String(verifier));

  /* ── Auto-fill template defaults ── */
  React.useEffect(() => {
    if (!selectedTemplate) return;
    const nextForm = buildTemplateDefaultFormState(selectedTemplate, state.aivmForm);
    const currentForm = state.aivmForm ?? { templateId: null };
    if (!shallowEqualRecord(nextForm, currentForm)) {
      dispatch({ type: "SET_AIVM_FORM", payload: nextForm });
    }
  }, [dispatch, selectedTemplate, state.aivmForm]);

  /* ── Sync verification state ── */
  React.useEffect(() => {
    let cancelled = false;

    async function syncVerificationState() {
      if (!templateId) return;
      const tpl = getTemplateByIdSync(templateId);
      if (!tpl?.modelId) return;

      const model = await getModelFromRegistry(tpl.modelId).catch(() => null);
      if (cancelled) return;

      const paramsPayload = buildCanonicalAivmParamsPayload({
        templateId,
        form: state.aivmForm ?? {},
        intent: state.intent,
      });

      const paramsHash = buildCanonicalAivmParamsHash({
        templateId,
        form: state.aivmForm ?? {},
        intent: state.intent,
      });
      const resolvedVerifier = DEPLOYED_CONTRACTS.ChallengePayAivmPoiVerifier ?? null;

      const nextVerifier =
        style === "SIMPLE"
          ? resolvedVerifier
          : (state.verification.verifier ?? resolvedVerifier ?? null);

      const nextModelHash = ((model as any)?.modelHash ?? null) as `0x${string}` | null;

      const same =
        state.verification.mode === FIXED_MODE &&
        state.verification.backend === FIXED_BACKEND &&
        state.verification.templateId === templateId &&
        state.verification.modelId === tpl.modelId &&
        state.verification.modelHash === nextModelHash &&
        state.verification.paramsHash === paramsHash &&
        state.verification.verifier === nextVerifier;

      if (same) return;

      dispatch({
        type: "SET_VERIFICATION",
        payload: {
          mode: FIXED_MODE,
          backend: FIXED_BACKEND,
          templateId,
          modelId: tpl.modelId,
          modelHash: nextModelHash,
          params: paramsPayload,
          paramsHash,
          verifier: nextVerifier ? (nextVerifier as `0x${string}`) : undefined,
        },
      });
    }

    void syncVerificationState();
    return () => { cancelled = true; };
  }, [
    templateId,
    style,
    state.aivmForm,
    state.intent,
    state.verification.mode,
    state.verification.backend,
    state.verification.templateId,
    state.verification.modelId,
    state.verification.modelHash,
    state.verification.paramsHash,
    state.verification.verifier,
    dispatch,
  ]);

  return (
    <div className="space-y-5">
      {/* ── AIVM + PoI verification badge ── */}
      <div className="cw-verification-badge">
        <div className="cw-verification-badge__icon">
          <ShieldCheck size={20} />
        </div>
        <div className="cw-verification-badge__text">
          <span className="cw-verification-badge__title">
            Lightchain AIVM + PoI
            <SettlementTooltip />
          </span>
          <span className="cw-verification-badge__sub">
            Decentralized AI verification with Proof-of-Intelligence
          </span>
        </div>
        <div className="cw-verification-badge__status">
          {verifierValid ? (
            <CheckCircle2 size={16} className="cw-verification-badge__ok" />
          ) : null}
        </div>
      </div>

      {/* ── Template selection ── */}
      <div className="cw-section">
        <div className="cw-section__head">
          <h3 className="cw-section__title">Choose a template</h3>
          <p className="cw-section__sub">
            Select the verification model for your challenge.
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="cw-empty-templates">
            {registryReady
              ? "No templates available for this challenge type."
              : "Loading…"}
          </div>
        ) : (
          <div className="cw-template-grid">
            {templates.map((tpl) => {
              const active = tpl.id === templateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    dispatch({ type: "SET_AIVM_FORM", payload: { templateId: tpl.id } });
                    dispatch({
                      type: "SET_VERIFICATION",
                      payload: {
                        mode: FIXED_MODE,
                        backend: FIXED_BACKEND,
                        templateId: tpl.id,
                        modelId: null,
                        modelHash: null,
                        params: undefined,
                        paramsHash: undefined,
                        benchmarkHash: undefined,
                        verifier: null,
                      },
                    });
                  }}
                  className={`cw-template-card ${active ? "is-selected" : ""}`}
                >
                  <div className="cw-template-card__head">
                    <span className="cw-template-card__name">{tpl.name}</span>
                    {active ? (
                      <CheckCircle2 size={16} className="cw-template-card__check" />
                    ) : null}
                  </div>
                  {tpl.hint ? (
                    <span className="cw-template-card__hint">{tpl.hint}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Template requirements (if selected) ── */}
      {selectedTemplate ? (
        <TemplateRequirements
          template={selectedTemplate}
          state={state}
          dispatch={dispatch}
        />
      ) : (
        <div className="cw-pick-hint">
          <Sparkles size={16} />
          <span>Pick a template above to configure your challenge parameters.</span>
        </div>
      )}
    </div>
  );
}
