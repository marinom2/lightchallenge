// app/proofs/advanced/page.tsx
// Advanced/manual proof submission — wraps the original model-browser flow.
// Normal users should use the challenge-centric flow at /proofs instead.
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useSearchParams } from "next/navigation";
import type { Address } from "viem";
import { isHex } from "viem";
import { ShieldCheck } from "lucide-react";

import Link from "next/link";
import Step1_SelectTask from "../components/Step1_SelectTask";
import Step2_ProvideContext from "../components/Step2_ProvideContext";
import Step3_Execute from "../components/Step3_Execute";
import { Stepper } from "@/app/challenges/create/components/Stepper";
import { useSteamBinding } from "../hooks/useSteamBinding";
import type { UiModel, ModelParam } from "../types";

const is0x32 = (v: unknown): v is `0x${string}` =>
  typeof v === "string" && isHex(v) && v.length === 66;
const toArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

export default function AdvancedValidatorsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <AdvancedInner />
    </Suspense>
  );
}

function AdvancedInner() {
  const { address } = useAccount();

  // Hidden from normal UX — only accessible via direct URL for debugging.
  // Show a warning banner so accidental visitors know to go back.
  const isDev = process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" && window.location.search.includes("debug=1"));
  const { binding: steamBinding, loading: steamLoading } = useSteamBinding();
  const searchParams = useSearchParams();

  /* ─ Model catalog from /api/admin/models (DB-backed via admin API) ─ */
  const [models, setModels] = useState<UiModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [errorModels, setErrorModels] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/models?ts=" + Date.now(), {
          cache: "no-store",
        });
        const data = await res.json();

        const rawList: any[] = Array.isArray(data?.models)
          ? data.models
          : Array.isArray(data)
          ? data
          : [];

        const parsed: UiModel[] = [];
        for (const m of rawList) {
          const mh = m?.modelHash ?? m?.id ?? m?.model;
          if (!is0x32(mh)) continue;

          const rawParams = toArray<any>(m?.params);
          const params: ModelParam[] = rawParams.map((p) => ({
            key: String(p.key),
            label: String(p.label ?? p.key),
            type: p.type as ModelParam["type"],
            placeholder: p.placeholder,
            default: p.default,
            defaultValue: p.defaultValue ?? p.default,
            required: !!p.required,
          }));

          const sources = toArray<string>(m?.sources).map((s) =>
            String(s).toLowerCase()
          );
          const requiresSteam =
            /dota/.test(String(m.label || m.name || m.id).toLowerCase()) ||
            sources.some((s) => s.includes("steam"));

          parsed.push({
            modelHash: mh as `0x${string}`,
            name: String(m.label || m.name || m.id || "Model"),
            verifierKind:
              String(m.kind || m.verifierKind || "aivm").toUpperCase() === "ZK"
                ? "ZK"
                : "AIVM",
            providers: requiresSteam ? (["steam"] as Array<"steam">) : [],
            notes: typeof m.notes === "string" ? m.notes : undefined,
            params,
          });
        }
        parsed.sort((a, b) => a.name.localeCompare(b.name));
        if (!stop) {
          setModels(parsed);
          setLoadingModels(false);
        }
      } catch (e: any) {
        if (!stop) {
          setErrorModels(e?.message || "Could not load models.json");
          setLoadingModels(false);
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  /* ─ stepper / state ─ */
  const [step, setStep] = useState(1);
  const steps = [
    { id: 1, name: "Select Model" },
    { id: 2, name: "Provide Context" },
    { id: 3, name: "Submit" },
  ];

  const [search, setSearch] = useState("");
  const [selectedHash, setSelectedHash] = useState<`0x${string}` | null>(null);
  const selectedModel = useMemo(
    () => models.find((m) => m.modelHash === selectedHash) ?? null,
    [selectedHash, models]
  );

  /* step 2 */
  const [challengeId, setChallengeId] = useState("");
  const [subject, setSubject] = useState("");

  /* ─ URL param bootstrap ─ */
  const urlBootstrapped = useRef(false);
  useEffect(() => {
    if (loadingModels || urlBootstrapped.current) return;
    urlBootstrapped.current = true;

    const paramChallengeId = searchParams.get("challengeId");
    const paramModelHash = searchParams.get("modelHash");

    let nextStep = 1;

    async function resolveAndApply() {
      let resolvedHash: string | null = paramModelHash;

      if (!resolvedHash && paramChallengeId) {
        try {
          const r = await fetch(`/api/challenges/meta/${paramChallengeId}`, { cache: "no-store" });
          const meta = r.ok ? await r.json() : {};
          if (meta?.modelHash && is0x32(meta.modelHash)) {
            resolvedHash = meta.modelHash;
          }
        } catch {
          // no-op
        }
      }

      if (resolvedHash && is0x32(resolvedHash)) {
        const found = models.find((m) => m.modelHash === resolvedHash);
        if (found) {
          setSelectedHash(found.modelHash);
          nextStep = 2;
        }
      }

      if (paramChallengeId) {
        setChallengeId(paramChallengeId);
        nextStep = 2;
      }

      if (nextStep > 1) setStep(nextStep);
    }

    void resolveAndApply();
  }, [loadingModels, models, searchParams]);

  const [params, setParams] = useState<Record<string, any>>({});
  useEffect(() => {
    if (!selectedModel) return;
    const next: Record<string, any> = {};
    for (const p of selectedModel.params ?? []) {
      const dv = p.defaultValue ?? p.default;
      if (dv !== undefined) next[p.key] = dv;
    }
    setParams(next);
  }, [selectedModel?.modelHash, selectedModel?.params]);

  /* step 3 */
  const [pending, setPending] = useState(false);
  const [intakeResult, setIntakeResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  /* gating */
  const requiresSteam = !!selectedModel?.providers?.includes("steam");
  const step2Done = !!selectedModel && (!requiresSteam || !!steamBinding);
  const canGoStep2 = step2Done;
  const canGoStep3 = step2Done;

  /* preview */
  async function runPreview() {
    if (!selectedModel) return;
    setError(null);
    setIntakeResult(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("modelHash", selectedModel.modelHash);
      if (challengeId) fd.set("challengeId", challengeId);
      const subj = (subject || address || "") as Address | string;
      fd.set("subject", String(subj));
      if (params && Object.keys(params).length)
        fd.set("params", JSON.stringify(params));
      if (file) fd.set("file", file);

      const res = await fetch("/api/aivm/intake", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Submission failed");

      setIntakeResult(json);
      setStep(3);
    } catch (e: any) {
      const msg = e?.message ?? "Submission failed";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  if (!isDev) {
    return (
      <div className="container-narrow py-12 text-center space-y-4">
        <div className="text-lg font-semibold">Developer tool</div>
        <p className="text-sm text-(--text-muted) max-w-md mx-auto">
          This page is for debugging only. Use the guided proof flow instead.
        </p>
        <Link href="/proofs" className="btn btn-primary">Go to Submit Proof</Link>
      </div>
    );
  }

  return (
    <div className="validators-page min-h-[70vh]">
      <header aria-label="Advanced submission header">
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div
            className="rounded-2xl px-4 py-3 flex items-center justify-between gap-4"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--grad-1) 10%, transparent), color-mix(in oklab, #000 18%, var(--card)))",
              border:
                "1px solid color-mix(in oklab, var(--border) 70%, transparent)",
              boxShadow: "0 6px 24px rgba(0,0,0,.28)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="size-5 text-(--text-muted) shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-extrabold tracking-wide h-gradient truncate">
                  Advanced Submission
                </div>
                <div className="text-[11px] text-(--text-muted) truncate">
                  Manual model selection and evidence submission
                </div>
              </div>
            </div>
            <Link href="/proofs" className="btn btn-ghost btn-sm text-xs">
              ← Challenge view
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 space-y-8">
        <Stepper
          steps={steps}
          currentStep={step}
          onStepClick={(s) => {
            setError(null);
            if (s === 1) return setStep(1);
            if (s === 2 && !canGoStep2) return;
            if (s === 3 && !canGoStep3) return;
            setStep(s);
          }}
        />

        {loadingModels && (
          <div className="text-center text-(--text-muted) py-8">
            Loading models…
          </div>
        )}
        {errorModels && (
          <div className="tone-warn text-center py-8">{errorModels}</div>
        )}

        {!loadingModels && !errorModels && (
          <>
            {step === 1 && (
              <Step1_SelectTask
                models={models}
                searchQuery={search}
                onSearch={setSearch}
                onSelectModel={(hash) => {
                  setError(null);
                  setIntakeResult(null);
                  setFile(null);
                  setSelectedHash(hash);
                  setStep(2);
                }}
              />
            )}

            {step === 2 && (
              <Step2_ProvideContext
                selectedModel={selectedModel}
                wallet={address as `0x${string}` | undefined}
                steamBinding={steamBinding}
                steamLoading={steamLoading}
                challengeId={challengeId}
                onChallengeIdChange={setChallengeId}
                subject={subject}
                onSubjectChange={setSubject}
                params={params}
                onParamChange={setParams}
                onNext={() => setStep(3)}
                canNext={canGoStep3}
              />
            )}

            {step === 3 && (
              <Step3_Execute
                file={file}
                onFileChange={setFile}
                intakeResult={intakeResult}
                txHash={null}
                error={error}
                onPreview={runPreview}
                canSubmit={false}
                pending={pending}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
