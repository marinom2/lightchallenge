"use client";

import * as React from "react";
import { Info } from "lucide-react";
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
  VERIFICATION_BACKEND_LABEL,
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

function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (next: T) => void;
  items: Array<{ value: T; label: string; hint?: string }>;
}) {
  return (
    <div
      className="grid gap-2 sm:grid-cols-2"
      style={{
        gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => {
        const active = item.value === value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className="rounded-2xl border px-4 py-3 text-left transition"
            style={{
              borderColor: active
                ? "color-mix(in oklab, var(--grad-2) 55%, var(--border))"
                : "color-mix(in oklab, var(--border) 80%, transparent)",
              background: active
                ? "linear-gradient(180deg, color-mix(in oklab, var(--grad-2) 10%, transparent), color-mix(in oklab, var(--surface) 88%, transparent))"
                : "color-mix(in oklab, var(--surface) 92%, transparent)",
              boxShadow: active
                ? "0 0 0 1px color-mix(in oklab, var(--grad-2) 20%, transparent) inset"
                : "none",
              cursor: "pointer",
            }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {item.label}
            </div>
            {item.hint ? (
              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {item.hint}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-3xl border p-5"
      style={{
        borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
        background: "color-mix(in oklab, var(--surface) 92%, transparent)",
      }}
    >
      <div className="mb-4">
        <div className="text-base font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </div>
        {subtitle ? (
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium" style={{ color: "var(--text)" }}>
      {children}
    </label>
  );
}

function HintBox({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "ok" | "warn";
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "ok"
      ? {
          borderColor: "color-mix(in oklab, var(--ok, #22c55e) 35%, var(--border))",
          iconColor: "var(--ok, #22c55e)",
        }
      : tone === "warn"
      ? {
          borderColor: "color-mix(in oklab, var(--warn, #f59e0b) 35%, var(--border))",
          iconColor: "var(--warn, #f59e0b)",
        }
      : {
          borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
          iconColor: "var(--text-muted)",
        };

  return (
    <div
      className="rounded-2xl border px-4 py-3"
      style={{
        borderColor: styles.borderColor,
        background: "color-mix(in oklab, var(--surface-2) 92%, transparent)",
      }}
    >
      <div className="flex items-start gap-3">
        <Info size={18} style={{ color: styles.iconColor }} />
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

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
    dispatch({
      type: "SET_AIVM_FORM",
      payload: { [key]: value },
    });
  };

  const editableFields = template.fields.filter((f) => f.kind !== "readonly");
  if (editableFields.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Template requirements
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          These parameters are required for the selected Lightchain AIVM template.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {editableFields.map((field) => {
          const raw = state.aivmForm?.[field.key];

          if (field.kind === "number") {
            return (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <input
                  className="input w-full"
                  type="number"
                  min={field.min}
                  step={field.step ?? 1}
                  value={raw == null ? "" : String(raw)}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.default != null ? String(field.default) : ""}
                />
              </div>
            );
          }

          if (field.kind === "text") {
            return (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <input
                  className="input w-full"
                  value={raw == null ? "" : String(raw)}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder={field.default ?? ""}
                />
              </div>
            );
          }

          if (field.kind === "select") {
            const options = resolveTemplateFieldOptions(field, state);

            if (options.length > 0) {
              return (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  <select
                    className="input w-full"
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
                </div>
              );
            }

            return (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <input
                  className="input w-full"
                  value={raw == null ? "" : String(raw)}
                  onChange={(e) => setField(field.key, e.target.value)}
                  placeholder="Enter value"
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export default function Step3_Options({
  state,
  dispatch,
}: {
  state: ChallengeFormState;
  dispatch: React.Dispatch<Action>;
}) {
  const style = (state.verification.style ?? "SIMPLE") as VerificationStyle;
  const backend =
    (state.verification.backend as VerificationBackend | null | undefined) ??
    FIXED_BACKEND;

  const templateId =
    state.aivmForm?.templateId ?? state.verification.templateId ?? "";
  const verifier = state.verification.verifier ?? null;

  const [registryReady, setRegistryReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    ensureTemplateRegistryLoaded()
      .then(() => {
        if (alive) setRegistryReady(true);
      })
      .catch(() => {
        if (alive) setRegistryReady(true);
      });

    return () => {
      alive = false;
    };
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

  React.useEffect(() => {
    if (!selectedTemplate) return;

    const nextForm = buildTemplateDefaultFormState(selectedTemplate, state.aivmForm);
    const currentForm = state.aivmForm ?? { templateId: null };

    if (!shallowEqualRecord(nextForm, currentForm)) {
      dispatch({
        type: "SET_AIVM_FORM",
        payload: nextForm,
      });
    }
  }, [dispatch, selectedTemplate, state.aivmForm]);

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

    return () => {
      cancelled = true;
    };
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

  const styleItems: Array<{
    value: VerificationStyle;
    label: string;
    hint: string;
  }> = [
    {
      value: "SIMPLE",
      label: "Simple",
      hint: "Recommended. Auto-fills the correct Lightchain PoI verifier and hides unnecessary controls.",
    },
    {
      value: "ADVANCED",
      label: "Advanced",
      hint: "Manual control for verifier address while keeping the Lightchain AIVM + PoI flow.",
    },
  ];

  return (
    <div className="space-y-5">
      <Section
        title="Verification"
        subtitle="This challenge uses Lightchain AIVM with PoI settlement. Select a template and confirm the verifier."
      >
        <div className="space-y-2">
          <Label>Style</Label>
          <Segmented
            value={style}
            onChange={(next) =>
              dispatch({ type: "SET_VERIFICATION_STYLE", payload: next })
            }
            items={styleItems}
          />
        </div>

        <HintBox tone="ok" title="Settlement path">
          Backend:{" "}
          <span className="font-semibold">
            {VERIFICATION_BACKEND_LABEL[backend]}
          </span>
          . This challenge will use the Lightchain async lifecycle:
          request → commit → reveal → PoI attestation → finalize.
        </HintBox>

        <div className="space-y-2">
          <Label>Mode</Label>
          <div
            className="rounded-2xl border px-4 py-3"
            style={{
              borderColor: "color-mix(in oklab, var(--grad-2) 55%, var(--border))",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--grad-2) 10%, transparent), color-mix(in oklab, var(--surface) 88%, transparent))",
              boxShadow:
                "0 0 0 1px color-mix(in oklab, var(--grad-2) 20%, transparent) inset",
            }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Lightchain AIVM
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Fixed mode for this flow. The verifier path is Lightchain AIVM + PoI.
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Template</Label>

          {templates.length === 0 ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm"
              style={{
                borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
                background: "color-mix(in oklab, var(--surface-2) 92%, transparent)",
                color: "var(--text-muted)",
              }}
            >
              {registryReady
                ? "No templates available for the selected challenge type."
                : "Loading templates…"}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {templates.map((tpl) => {
                const active = tpl.id === templateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      const nextId = tpl.id;
                      dispatch({ type: "SET_AIVM_FORM", payload: { templateId: nextId } });
                      dispatch({
                        type: "SET_VERIFICATION",
                        payload: {
                          mode: FIXED_MODE,
                          backend: FIXED_BACKEND,
                          templateId: nextId,
                          modelId: null,
                          modelHash: null,
                          params: undefined,
                          paramsHash: undefined,
                          benchmarkHash: undefined,
                          verifier: null,
                        },
                      });
                    }}
                    className="rounded-2xl border px-4 py-3 text-left transition"
                    style={{
                      borderColor: active
                        ? "color-mix(in oklab, var(--grad-2) 55%, var(--border))"
                        : "color-mix(in oklab, var(--border) 80%, transparent)",
                      background: active
                        ? "linear-gradient(180deg, color-mix(in oklab, var(--grad-2) 10%, transparent), color-mix(in oklab, var(--surface) 88%, transparent))"
                        : "color-mix(in oklab, var(--surface) 92%, transparent)",
                      boxShadow: active
                        ? "0 0 0 1px color-mix(in oklab, var(--grad-2) 20%, transparent) inset"
                        : "none",
                      cursor: "pointer",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {tpl.name}
                      </div>
                      {active && (
                        <div
                          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            borderColor: "color-mix(in oklab, var(--grad-2) 55%, var(--border))",
                            background: "color-mix(in oklab, var(--grad-2) 10%, var(--surface))",
                            color: "var(--text)",
                            border: "1px solid",
                          }}
                        >
                          Selected
                        </div>
                      )}
                    </div>
                    {tpl.hint ? (
                      <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {tpl.hint}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Templates define the model, required params, and the deterministic input used later by the AIVM PoI pipeline.
          </div>
        </div>

        {selectedTemplate ? (
          <TemplateRequirements
            template={selectedTemplate}
            state={state}
            dispatch={dispatch}
          />
        ) : (
          <HintBox title="Template required">
            Choose a template first. That resolves the model, canonical params payload, and params hash used by the PoI flow.
          </HintBox>
        )}

        {selectedTemplate ? (
          <div
            className="rounded-2xl border px-4 py-3"
            style={{
              borderColor: "color-mix(in oklab, var(--border) 80%, transparent)",
              background: "color-mix(in oklab, var(--surface-2) 92%, transparent)",
            }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Selected model
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {state.verification.modelId ?? selectedTemplate.modelId ?? "—"}
            </div>
          </div>
        ) : null}

        <HintBox
          tone={verifierValid ? "ok" : "warn"}
          title={style === "SIMPLE" ? "Verifier resolved from backend" : "Verifier contract"}
        >
          {verifierValid ? (
            <>
              Current verifier: <span className="font-mono">{String(verifier)}</span>
            </>
          ) : deployedDefaultVerifier ? (
            <>
              Default fallback:{" "}
              <span className="font-mono">{deployedDefaultVerifier}</span>
            </>
          ) : (
            "No verifier was found in deployments/lightchain.json."
          )}
        </HintBox>

        {style === "ADVANCED" ? (
          <div className="space-y-2">
            <Label>Verifier address</Label>
            <input
              className="input w-full font-mono"
              placeholder="0x..."
              value={verifier ?? ""}
              onChange={(e) =>
                dispatch({
                  type: "SET_VERIFICATION",
                  payload: { verifier: (e.target.value || null) as any },
                })
              }
            />
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Advanced mode can override the default ChallengePay Lightchain PoI verifier, but usually should not.
            </div>
          </div>
        ) : null}
      </Section>

    </div>
  );
}