// app/validators/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import type { Abi, Address, Hex } from "viem";
import { encodeAbiParameters, parseAbiParameters, isHex } from "viem";
import { ShieldCheck } from "lucide-react";

import Step1_SelectTask from "./components/Step1_SelectTask";
import Step2_ProvideContext from "./components/Step2_ProvideContext";
import Step3_Execute from "./components/Step3_Execute";
import { Stepper } from "@/app/challenges/create/components/Stepper";
import { useSteamBinding } from "./hooks/useSteamBinding";
import { useTx } from "@/lib/tx";
import { ADDR, ABI } from "@/lib/contracts";
import type { UiModel, ModelParam } from "./types";

/* helpers */
const is0x32 = (v: unknown): v is `0x${string}` =>
  typeof v === "string" && isHex(v) && v.length === 66;
const toArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

export default function ValidatorsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading…</div>}>
      <ValidatorsPageInner />
    </Suspense>
  );
}

function ValidatorsPageInner() {
  const { address } = useAccount();
  const { binding: steamBinding, loading: steamLoading } = useSteamBinding();
  const { writeContractAsync, isPending: wagmiPending } = useWriteContract();
  const { simulateAndSend } = useTx();

  /* ─ models.json ─ */
  const [models, setModels] = useState<UiModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [errorModels, setErrorModels] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const res = await fetch("/models/models.json?ts=" + Date.now(), {
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
    { id: 1, name: "Select Task" },
    { id: 2, name: "Provide Context" },
    { id: 3, name: "Execute" },
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
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  /* gating */
  const requiresSteam = !!selectedModel?.providers?.includes("steam");
  const step1Done = !!selectedModel;
  const step2Done = !!selectedModel && (!requiresSteam || !!steamBinding);
  const canGoStep2 = step2Done;
  const canGoStep3 = step2Done;

  /* one-time hint removed (avoids extra toasts) */

  /* preview */
  async function runPreview() {
    if (!selectedModel) return;
    setError(null);
    setIntakeResult(null);
    setTxHash(null);
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
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Preview failed");

      setIntakeResult(json);
      setStep(3);
    } catch (e: any) {
      const msg = e?.message ?? "Preview failed";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  async function submitProofFrontend() {
    try {
      setPending(true);
      setError(null);
      setTxHash(null);

      if (!selectedModel) throw new Error("Pick a model first.");
      if (!selectedHash) throw new Error("Missing model hash.");
      if (!challengeId || !/^\d+$/.test(challengeId))
        throw new Error("Challenge ID must be numeric.");
      const user = (subject || address) as Address | undefined;
      if (!user) throw new Error("Connect wallet or enter subject address.");
      if (!intakeResult?.dataHash || !isHex(intakeResult.dataHash))
        throw new Error("Preview missing dataHash.");

      const pubSignalsRaw: Array<string | number | bigint> = Array.isArray(
        intakeResult.publicSignals
      )
        ? intakeResult.publicSignals
        : [];
      const pubSignals = pubSignalsRaw.map((x) => BigInt(x));
      const payload = encodeAbiParameters(
        parseAbiParameters("uint256[], bytes32"),
        [pubSignals, intakeResult.dataHash as Hex]
      );

      const signRes = await fetch("/api/proof/aivm/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user,
          challengeId: Number(challengeId),
          modelId: selectedHash,
          modelVersion: 1,
          payload,
        }),
      });
      const signJson = await signRes.json();
      if (!signRes.ok || !signJson?.packed)
        throw new Error(signJson?.error || "Signing failed");

      const sim = await simulateAndSend({
        address: ADDR.ChallengePay!,
        abi: ABI.ChallengePay as unknown as Abi,
        functionName: "submitProof",
        args: [BigInt(challengeId), signJson.packed as `0x${string}`],
      });
      const req = sim.request as Parameters<typeof writeContractAsync>[0];
      const hash = await writeContractAsync(req);
      setTxHash(hash);
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Submit failed";
      setError(msg);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="validators-page min-h-[70vh]">
      {/* HEADER: glass, non-sticky */}
      <header aria-label="Validators header">
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
              <ShieldCheck className="size-5 text-[var(--text-muted)] shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-extrabold tracking-wide h-gradient truncate">
                  Validators
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  Submit verifiable evidence for challenges
                </div>
              </div>
            </div>

            {/* inline glass status */}
            <ul className="text-xs space-y-1">
              <li className="flex items-center gap-2">
                <span
                  className={`inline-block size-2 rounded-full ${
                    step1Done ? "bg-[var(--ok)]" : "bg-[var(--warn)]"
                  }`}
                />
                Model selected
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`inline-block size-2 rounded-full ${
                    step2Done ? "bg-[var(--ok)]" : "bg-[var(--warn)]"
                  }`}
                />
                Requirements met
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={`inline-block size-2 rounded-full ${
                    txHash ? "bg-[var(--ok)]" : "bg-[var(--warn)]"
                  }`}
                />
                Proof submitted
              </li>
            </ul>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 space-y-8">
        <Stepper
          steps={steps}
          currentStep={step}
          onStepClick={(s) => {
            // Clear stale error when navigating
            setError(null);
            if (s === 1) return setStep(1);
            if (s === 2 && !canGoStep2) return;
            if (s === 3 && !canGoStep3) return;
            setStep(s);
          }}
        />

        {loadingModels && (
          <div className="text-center text-[var(--text-muted)] py-8">
            Loading models…
          </div>
        )}
        {errorModels && (
          <div className="tone-warn text-center py-8">{errorModels}</div>
        )}

        {/* No inline error banner under the steps anymore */}

        {!loadingModels && !errorModels && (
          <>
            {step === 1 && (
              <Step1_SelectTask
                models={models}
                searchQuery={search}
                onSearch={setSearch}
                onSelectModel={(hash) => {
                  // selecting a model should clear stale state + error
                  setError(null);
                  setIntakeResult(null);
                  setTxHash(null);
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
              />
            )}

            {step === 3 && (
              <Step3_Execute
                file={file}
                onFileChange={setFile}
                intakeResult={intakeResult}
                txHash={txHash}
                error={error}
                onPreview={runPreview}
                onSubmit={submitProofFrontend}
                canSubmit={!!intakeResult && !pending && !wagmiPending}
                pending={pending || wagmiPending}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}